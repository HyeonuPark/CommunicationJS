import Event from 'events'
import Imm from 'immutable'
//import {bound, delegate} from './decorators.js'
import {Operator} from './operator.js'

const MSG_TYPE_LEN = 1
const STREAM_ID_LEN = 36

const STATE = Symbol('state')

const DEFAULT_CONFIG = {}

import * as WebRTC from './adaptor/webrtc.js'

const {connect, receive} =
  WebRTC.support
    ? WebRTC
    : {}

/**
 * Connection
 *
 * Connection object can manage multiple media streams
 * even under unstable network state
 *
 *
 * Event summary
 *
 * 	message:
 * 		Connection wants to send some message to signalling channel
 * 		@arg: {String} message
 * 			this message should be passed to remote connection's 'receive' method
 *
 * 	running:
 * 		Connection established and start working
 * 		all method calls before this event is executed after this event
 *
 * 	streamAdded:
 * 		remote peer added stream to this connection
 * 		@arg: {MediaStream} stream
 * 		@arg: {String} id
 * 			remote stream's id
 * 			may not be same as stream.id
 * 		@arg: {Object} metadata
 * 			metadata sent from remote peer
 *
 *	streamUpdated:
 *		remote stream needs to be updated
 *		emitted when connection is re-established
 *		@arg: {MediaStream} stream
 *		@arg: {String} id
 *			same as metadata.$id from original streamAdded event
 *
 * 	streamRemoved:
 * 		remote peer removed stream from this connection
 * 		@arg: {String} id
 * 			same as metadata.$id from original streamAdded event
 *
 * 	closed:
 * 		method close() is called or remote peer closed this connection
 * 		@arg: Boolean
 * 			true if connection is closed from remote peer
 * 		@arg: Any
 * 			reason why this connection is closed
 * 			passed from method close()
 */
//@bound('on', 'once', 'off', 'emit')
export class Connection extends Event {
  constructor (_config) {
    super()
    if (connect == null) {
      console.warn('This browser does not support Real Time Communication API')
      return null
    }

    this.config = {...DEFAULT_CONFIG, ..._config}

    /**
     * this[STATE] represnts connection's current state
     * @enum {'waiting'|'running'|'closed'}
     */
    this[STATE] = 'waiting'

    this._localConnections = Imm.Map()
    this._remoteConnections = Imm.Map()

    this.on('running', () => {
      delegate.run(this)
    })

    const remote = this._remote = Operator(::this._send)

    remote.on('init', ({message, send, done}) => {
      this[STATE] = 'running'
      this.emit('running')
      done()
    })

    remote.on('streamAdded', ({message, send, done}) => {
      const {id, meta} = message

      const conn = this._getRemoteConn(id)
      conn.on('stream', stream => {
        this.emit('streamAdded', stream, id, meta)
      })
      this._registerConn(id, conn)
      done()
    })

    remote.on('streamRemoved', ({message, send, done}) => {
      const {id} = message
      const remoteConns = this._remoteConnections
      const conn = remoteConns.get(id)
      if (!conn) {
        return done()
      }
      this._remoteConnections = remoteConns.delete(id)
      conn.close()
      this.emit('streamRemoved', id)
      done()
    })

    remote.on('closed', ({message, send, done}) => {
      const {reason} = message
      this[STATE] = 'closed'
      this.emit('closed', true, reason)
      done()
    })

    remote.on('connectionClosed', ({message, send, done}) => {
      const {id} = message
      const localConns = this._localConnections
      const conn = localConns.get(id)
      if (!conn) {
        return done({streamNotFound: true})
      }
      const stream = conn.getStream()
      conn.close()
      this._localConnections = localConns.delete(id)

      send().then(({message, send, done}) => {
        this._getLocalConn(stream)
      })
    })

    this.on('closed', () => {
      for (localConn of this._localConnections.values()) {
        localConn.close()
      }
      for (remoteConn of this._remoteConnections.values()) {
        remoteConn.close()
      }
      this._localConnections = Imm.Map()
      this._remoteConnections = Imm.Map()
    })

    remote.send('init')
  }

  /**
   * get connection's state
   * @return @enum {'waiting'|'running'|'closed'}
   */
  //@bound
  state () {
    return this[STATE]
  }

  /**
   * call it when signalling channel got new message to connection
   * remote connection's 'message' event should be passed to this method
   * @param  {String} msg
   *         message sent from remote connection object
   *         delevered via sinalling channel
   */
  //@bound
  //@delegate
  write (msg) {
    if (this.state() === 'closed') return

    if (msg.startsWith('L')) {
      const id = msg.substr(MSG_TYPE_LEN, STREAM_ID_LEN)
      const connImpl = this._localConnections.get(id)
      if (!connImpl) return
      connImpl.write(msg.slice(MSG_TYPE_LEN + STREAM_ID_LEN))

    } else if (msg.startsWith('R')) {
      const id = msg.substr(MSG_TYPE_LEN, STREAM_ID_LEN)
      const connImpl = this._remoteConnections.get(id)
      if (!connImpl) return
      connImpl.write(msg.slice(MSG_TYPE_LEN + STREAM_ID_LEN))

    } else if (msg.startsWith('G')) {
      try {
        const {ctx, msg, tpc} = JSON.parse(msg.slice(1))
        this._remote.accept(ctx, msg, tpc)
      } catch (e) {
        console.error('CONNECTION ERROR -', e, e.stack)
      }
    }
  }

  /**
   * add new MediaStream to connection
   * @param  {MediaStream} stream
   * @param  {Any} meta
   *         remote peer can check it on 'streamAdded' event
   *         NOTE: meta.$id field is reserved from this library
   * @return {String} id
   *         same as stream.id
   */
  //@bound
  //@delegate
  addStream (stream, meta) {
    this._remote.send('streamAdded', {id: stream.id, meta})
      .then(({message, send, done}) => {
        this._getLocalConn(stream)
      })
  }

  /**
   * remove MediaStream from connection
   * @param  {MediaStream|String} stream
   *         String is 'id' property of MediaStream
   */
  //@bound
  //@delegate
  removeStream (stream) {
    const id = stream.id || stream
    this._remote.send('streamRemoved', {id})
      .then(({message, send, done}) => {
        const localConns = this._localConnections
        const conn = localConns.get(id)
        if (!conn) return
        this._localConnections = localConns.delete(id)
        conn.close()
      })
  }

  /**
   * as you think
   * @return {Map<{String} id, {MediaStream} stream>} local streams
   */
  //@bound
  getLocalStreams () {
    if (this.state() !== 'running') {
      return Imm.Map()
    }
    return this._localConnections.map(conn => conn.getStream())
  }

  /**
   * yes, of course
   * @return {Map<{String} id, {MediaStream} stream>} remote streams
   */
  //@bound
  getRemoteStreams () {
    if (this.state() !== 'running') {
      return Imm.Map()
    }
    return this._remoteConnections.map(conn => conn.getStream())
  }

  /**
   * close this connection
   * remote connection also will be closed
   * @param  {Any} reason
   *         reason why close this connection
   *         it will be passed to 'closed' event
   */
  //@bound
  //@delegate
  close (reason) {
    this[STATE] = 'closed'
    this._send({
      type: 'closed',
      reason,
    })
    this.emit('closed', false, reason)
  }

  /**
   * Internal APIs
   * can be changed without warning
   */

  //@bound
  _isRunnable () {
    return this[STATE] !== 'waiting'
  }

  //@bound
  _send (ctx, msg, tpc) {
    try {
      const message = JSON.stringify({ctx, msg, tpc})
      this.emit('message', 'G' + message)
    } catch (e) {
      console.error('CONNECTION ERROR -', e, e.stack)
    }
  }

  //@bound
  _sendFromConnection (conn, msg) {
    try {
      const type = conn.isSender() ? 'R' : 'L'
      const id = conn.getId()
      const message = JSON.stringify(msg)
      this.emit('message', type + id + message)
    } catch (e) {
      console.error('CONNECTION ERROR -', e, e.stack)
    }
  }

  //@bound
  _getRemoteConn (id) {
    const conn = receive(id, this.config)

    conn.on('message', msg => {
      this._sendFromConnection(conn, msg)
    })

    conn.on('closed', () => {
      const remoteConns = this._remoteConnections

      //escape when connection is not in registry
      if (!remoteConns.get(id)) return

      //delete connection from registry
      this._remoteConnections = remoteConns.delete(id)

      this._remote.send('connectionClosed', {id})
        .then(({message, send, done}) => {
          const {streamNotFound} = message
          if (streamNotFound) return
          const conn = this._getRemoteConn(id)
          conn.on('stream', stream => {
            this.emit('streamUpdated', stream, id)
          })
          this._registerRemoteConn(id, conn)
          done()
        })
    })
    return conn
  }

  //@bound
  _registerRemoteConn (id, conn) {
    const remoteConns = this._remoteConnections
    const prevConn = remoteConns.get(id)
    if (prevConn) {
      prevConn.close()
    }
    this._remoteConnections = remoteConns.set(id, conn)
  }

  //@bound
  _getLocalConn (stream) {
    const id = stream.id
    const conn = connect(stream, this.config)
    conn.on('message', msg => {
      this._sendFromConnection(conn, msg)
    })
    const localConns = this._localConnections
    const prevConn = localConns.get(id)
    if (prevConn) {
      prevConn.close()
    }
    this._localConnections = localConns.set(id, conn)
    return conn
  }
}
