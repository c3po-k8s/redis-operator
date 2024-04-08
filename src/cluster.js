'use strict'
import log from './logger.js'
import k8Api from './k8Api.js'
import clients from './clients.js'
let NAME_SPACE = process.env.NAME_SPACE, SET_NAME = process.env.SET_NAME

const getRoles = async(pods = [])=>{
  try{
    let masters = [], replicas = [], standalone = [], all = [], status = true
    for(let i in pods){
      if(!status) break
      let data
      if(pods[i].status !== 'ready'){
        status = await clients.destroy(pods[i].index)
        continue;
      }
      status = clients.status(pods[i].index)
      if(!status) status = clients.recreate(pods[i].index)
      if(status) data = await clients.info(pods[i].index)
      if(data){
        data = { ...pods[i], ...data }
        all.push(data)
        if(data?.role === 'master' && data.label === 'master') masters.push(data)
        if(data?.role === 'master' && data.label !== 'master') standalone.push(data)
        if(data?.role === 'slave') replicas.push(data)
      }
    }
    return { masters: masters, replicas: replicas, standalone: standalone, all: all }
  }catch(e){
    throw(e)
  }
}
const getMaster = ({ masters = [], replicas = [], standalone = [] })=>{
  try{
    let master, masterIps = []
    if(masters?.length === 1) return masters[0]
    for(let i in replicas){
      if(replicas[i]?.master?.ip){
        let tempMaster = masters.find(x=>x.podIP === replicas[i]?.master?.ip)
        if(tempMaster){
          if(masterIps?.filter(x=>x.podIP === tempMaster?.podIP).length === 0) masterIps.push(tempMaster)
        }else{
          standalone.push(replicas[i])
        }
      }
    }

    if(masterIps.length === 1 && masterIps.filter(x=>x.podIP !== masterIps[0].podIP).length === 0) return masterIps[0]
    if(masterIps.length === 0){
      if(replicas.length === 0 && standalone.length > 0) return standalone[0]
      if(replicas.length > 0) return replicas[0]
    }
    if(masterIps.length > 1){
      for(let i in masterIps){
        if(replicas.filter(x=>x.master.ip === masterIps[i].podIP).length > 0){
          master = masterIps[i]
          break
        }
      }
    }
    if(master && masters.length > 0) masters = masters.filter(x=>x.podIP !== master.podIP)
    return master
  }catch(e){
    throw(e)
  }
}
const removeLabels = async(master = {}, pods = [])=>{
  try{
    let status = true
    for(let i in pods){
      if(!status) break
      if(pods[i].label === 'master')
      status = await k8Api.labelPod(pods[i].podName, 'role', null)
    }
    return status
  }catch(e){
    throw(e)
  }
}
const createMaster = async(master = {})=>{
  try{
    if(master.label === 'master' && master.role === 'master') return true
    let status = true
    if(master.label !== 'master'){
      log.info(`labeling ${master.podName} as master...`)
      status = await k8Api.labelPod(master.podName, 'role', 'master')
    }
    if(status && master.role !== 'master'){
      log.info(`setting ${master.podName} replica to NO ONE`)
      status = await clients.replicate(master.index, 'NO', 'ONE')
    }
    return status
  }catch(e){
    throw(e)
  }
}

const createReplicas = async(master = {}, replicas = [])=>{
  try{
    log.debug(`Checking ${replicas?.length} replicas for ${master.podName}...`)
    let status = true
    for(let i in replicas){
      if(!status) break
      if(!replicas[i] || replicas[i].status !== 'ready' || replicas[i]?.master?.ip === master.podIP) continue;
      if(replicas[i]?.label === 'master') status = await k8Api.labelPod(replicas[i].podName, 'role', null)
      if(status) status = clients.status(i)
      if(status){
        log.info(`setting ${replicas[i].podName} to be replica of ${master.podName}`)
        status = await clients.replicate(replicas[i].index, master.podIP, 6379)
      }
    }
    return status
  }catch(e){
    throw(e)
  }
}
const create = async(pods = [])=>{
  try{
    let roles = await getRoles(pods)
    if(roles?.all?.length === 0) return
    let master = getMaster(roles)
    if(!master) throw(`Could not determine a master pod...`)
    if(master.status !== 'ready') throw(`Could not determine a master pod...`)
    let allPods = roles?.all?.filter(x=>x?.podIP !== master?.podIP)
    let status = await removeLabels(master, allPods)
    if(status) status = await createMaster(master)
    if(status) status = await createReplicas(master, allPods)
    if(status) status = await clients.clean(pods)
    return status
  }catch(e){
    throw(e)
  }
}
export default {
  create: create
}
