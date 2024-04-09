'use strict'
import log from './logger.js'
import k8Api from './k8Api.js'
import { createClient } from 'redis';

let NAME_SPACE = process.env.NAME_SPACE, SET_NAME = process.env.SET_NAME, ADMIN_SERVICE_NAME = process.env.ADMIN_SERVICE_NAME, SERVICE_NAME = process.env.SERVICE_NAME
let clients = {}, clientsReady = false, masterReady = false

const timeoutCommand = async(command, index)=>{
  if(!clients[index]) return
  return new Promise(async(resolve, reject)=>{
    try{
      let timeout = setTimeout(resolve, 5000)
      let data = await clients[index][command]()

      clearTimeout(timeout)
      resolve(data)
    }catch(e){
      reject(e)
    }
  })
}

const startClient = async(index)=>{
  try{
    if(!clients[index]) return
    await clients[index].connect()
    return clients[index].isOpen
  }catch(e){
    throw(e)
  }
}
const clientStatus = (index)=>{
  return clients[index]?.isOpen
}
const destroyRedisClient = async(index)=>{
  try{
    log.debug(`Removing ${SET_NAME}-${index} redis client...`)
    if(!clients[index]) return true
    await clients[index].disconnect()
    delete clients[index]
    return true
  }catch(e){
    throw(e)
  }
}
const createRedisClient = async(index)=>{
  try{
    if(clients[index]){
      let status = clients[index].isOpen
      if(!status) status = await startClient(index)
      return status
    }
    let redisHost = `${SET_NAME}-${index}.${ADMIN_SERVICE_NAME}.${NAME_SPACE}.svc.cluster.local`
    log.debug(`Creating redis client ${SET_NAME}-${index}....`)
    let tempClient = createClient({socket: { port: 6379, host: redisHost }})
    tempClient.on('error', (err)=>{
      //managePods.checkMaster()
      if(err?.message?.includes('ECONNREFUSED') || err?.message?.includes('ENOTFOUND') || err?.message?.includes('ETIMEDOUT') || err?.message?.includes('timeout') || err?.message.includes('Socket closed unexpectedly')){
        log.debug(err.message)
        return
      }
      if(err?.message){
        log.error(err.message)
        log.debug(err)
        return
      }
      log.error(err)
    })
    tempClient.on('ready', ()=>{
      //managePods.checkMaster()
      log.debug(`${SET_NAME}-${index} redis client is ready...`)
    })
    await tempClient.connect()
    let status = tempClient.isOpen
    if(status){
      clients[index] = tempClient
      clients[index].on('end', ()=>{
        //managePods.checkMaster()
        log.debug(`${SET_NAME}-${index} redis client connection closed...`)
      })
      return true
    }
  }catch(e){
    throw(e)
  }
}

const recreateClient = async(index)=>{
  try{
    let status = await destroyRedisClient(index)

    if(status) status = await createRedisClient(index)
    return status
  }catch(e){
    throw(e)
  }
}
const replicate = async(index, masterPodIP, port = 6379)=>{
  try{
    if(!clients[index] || !port || !masterPodIP) return
    let status = await clients[index].REPLICAOF(masterPodIP, port)
    if(status === 'OK') return true
  }catch(e){
    throw(e)
  }
}
const transformInfo = (info)=>{
  if(!info) return
  var lines = info.split( "\r\n" );
    var obj = { };
    for ( var i = 0, l = info.length; i < l; i++ ) {
        var line = lines[ i ];
        if ( line && line.split ) {
            line = line.split( ":" );
            if ( line.length > 1 ) {
                var key = line.shift( );
                obj[ key ] = line.join( ":" );
            }
        }
    }
    return obj;

}
const getInfo = async(index)=>{
  try{
    if(!clients[index]) return
    log.debug(`getting infor for ${SET_NAME}-${index}....`)
    let data = await timeoutCommand('role', index)
    //let data = await clients[index].role()
    return data
    //if(data) data = await clients[index].INFO.tranformReply(data)
  }catch(e){
    throw(e)
  }
}
const cleanClients = async(pods = [])=>{
  try{
    let array = Object.keys(clients), status = true
    for(let i in pods){
      if(!status) break
      let index = pods[i].index
      if(pods[i].status !== 'ready' && clients[index]) status = await destroyRedisClient(index)
    }
    for(let i in array){
      if(!status) break
      let index = +array[i]
      if(pods?.filter(x=>+x.index === +index).length === 0) status = await destroyRedisClient(index)
    }
    return status
  }catch(e){
    throw(e)
  }
}
export default {
  clean: cleanClients,
  info: getInfo,
  replicate: replicate,
  create: createRedisClient,
  status: clientStatus,
  destroy: destroyRedisClient,
  recreate: recreateClient
}
