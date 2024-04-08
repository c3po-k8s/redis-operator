'use strict'
import k8s from '@kubernetes/client-node'
import log from './logger.js'
import path from 'path'
let NAME_SPACE = process.env.NAME_SPACE, SET_NAME = process.env.SET_NAME
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const getPod = async(podName)=>{
  try{
    if(!podName || !NAME_SPACE) return
    let data = await coreApi.readNamespacedPod(podName, NAME_SPACE)
    return data?.body
  }catch(e){
    throw(e)
  }
}
const getPods = async()=>{
  try{
    if(!NAME_SPACE || !SET_NAME) return
    let data = await coreApi.listNamespacedPod(NAME_SPACE, true, undefined, undefined, undefined, `app=${SET_NAME}`);
    return data?.body?.items
  }catch(e){
    throw(e)
  }
}
const getStatefulSet = async()=>{
  try{
    if(!NAME_SPACE || !SET_NAME) return
    let data = await appsApi.readNamespacedStatefulSet(SET_NAME, NAME_SPACE)
    return data?.body
  }catch(e){
    throw(e)
  }
}
const labelPod = async(podName, label, value )=>{
  try{
    if(!label || !podName || !NAME_SPACE) return
    let pod = await getPod(podName)
    if(pod?.metadata?.name !== podName) return
    let data = await coreApi.patchNamespacedPod(podName, NAME_SPACE, { metadata: { labels: { [label]: value || null} } }, undefined, undefined, undefined, undefined, undefined, { headers: { 'Content-type': 'application/merge-patch+json' } })
    if(data?.body?.metadata?.name === podName && ((value && data?.body?.metadata?.labels[label] === value) || !value && !data?.body?.metadata?.labels[label])) return true
  }catch(e){
    if(e?.response?.body) throw(e?.response?.body)
    throw(e)
  }
}
const getReplicaCount = async()=>{
  try{
    let data = await getStatefulSet()
    if(data?.spec) return +data.spec.replicas
  }catch(e){
    throw(e)
  }
}
const getPodIp = async(podName)=>{
  try{
    let pod = await getPod(podName)
    return pod?.status?.podIP
  }catch(e){
    throw(e)
  }
}
export default {
  getPod: getPod,
  getPods: getPods,
  getPodIp: getPodIp,
  getStatefulSet: getStatefulSet,
  getReplicaCount: getReplicaCount,
  labelPod: labelPod
}
