import Imm from 'immutable'
import Event from 'events'
import {v4 as uuid} from 'uuid'
//import {bound} from './decorators.js'

//@bound
export class Operator extends Event {
  constructor (send) {
    super()
    if (typeof send !== 'function') {
      throw new Error('Operator\'s argument should be a function')
    }
    this._send = send
    this._topicMap = Imm.Map()
    this._contextMap = Imm.Map()
  }

  //@bound
  accept (context, message, topic) {
    if (typeof topic === 'string') {
      const topicListener = this._topicMap.get(topic)
      if (!topicListener) return
      return topicListener({
        message,
        send: msg2send => {
          return this._sendAndWait(context, msg2send)
        },
        done: msg2send => {
          this._send(context, msg2send)
        }
      })
    }
    const listener = this._contextMap.get(context)
    if (!listener) return
    this._contextMap = this._contextMap.delete(context)
    listener(message)
  }

  //@bound
  on (topic, listener) {
    if (typeof topic !== 'string' || typeof listener !== 'function') return
    this._topicMap = this._topicMap.set(topic, listener)
  }

  //@bound
  send (topic, message) {
    const context = uuid()
    return this._sendAndWait(context, message, topic)
  }

  //@bound
  _sendAndWait (context, message, topic) {
    return new Promise(resolve => {
      this._contextMap = this._contextMap.set(context, income => {
        resolve({
          message: income,
          send: msg2send => {
            return this._sendAndWait(context, msg2send)
          },
          done: msg2send => {
            this._send(context, msg2send)
          }
        })
      })
      this._send(context, message, topic)
    })
  }
}
