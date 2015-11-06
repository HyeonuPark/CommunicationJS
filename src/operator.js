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
      const listener = this._topicMap.get(topic)
      if (!listener) return
      listener({
        message,
        send (msg2send) {
          this._send(context, message)
          return this._wait(context)
        },
        done (msg2send) {
          this._send(context, message)
        }
      })
    }
    const listener = this._contextMap.get(context)
    if (!listener) return
    this._contextMap.delete(context)
    listener(message)
  }

  //@bound
  on (topic, listener) {
    if (typeof topic !== 'string' || typeof listener !== 'function') return
    this._topicMap.set(topic, listener)
  }

  //@bound
  send (topic, message) {
    const context = uuid()
    this._send(context, message, topic)
    return this._wait(context)
  }

  //@bound
  _wait (context) {
    return new Promise(resolve => {
      this._contextMap = this._contextMap.set(context, income => {
        resolve({
          message: income,
          send (msg2send) {
            this._send(context, msg2send)
            return wait(context)
          },
          done (msg2send) {
            this._send(context, msg2send)
          }
        })
      })
    })
  }
}
