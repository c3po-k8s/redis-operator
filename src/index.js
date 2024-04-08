'use strict'
import log from './logger.js'
import clients from './clients.js'
import cluster from './cluster.js'
import k8Api from './k8Api.js'
let replicaCount = 0
let logLevel = process.env.LOG_LEVEL || log.Level.INFO, notify = true
//log.setLevel('debug');
const checkCluster = async()=>{
  try{
    if(notify) log.info(`Started ${process.env.SET_NAME} replication watcher....`)
    notify = false
    let pods = await k8Api.getPods()
    //log.info(pods)
    if(pods) pods = pods.map(x=>{
      let podStatus = 'fail'
      let condition = x?.status?.conditions?.find(x=>x.type === 'Ready')
      if(condition?.status === 'True') podStatus = 'ready'
      return Object.assign({}, {
        index: x?.metadata?.labels["apps.kubernetes.io/pod-index"],
        label: x?.metadata?.labels.role,
        podIP: x?.status?.podIP,
        podName: x.metadata?.name,
        status: podStatus
      })
    })
    if(pods?.length > 0) await cluster.create(pods)
    setTimeout(checkCluster, 5000)
  }catch(e){
    log.error(e)
    setTimeout(checkCluster, 5000)
  }
}
checkCluster()
