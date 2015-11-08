import Event from 'events'
import Messenger from 'async-messenger'

const MSG_TYPE_LEN = 1
const STREAM_ID_LEN = 36

const STATE = Symbol('state')

const DEFAULT_CONFIG = {}

export class Communication extends Event {
  constructor (adaptor, _config) {
    super()
    this.adaptor = adaptor
    this.config = {...DEFAULT_CONFIG, ..._config}

    this[STATE] = 'waiting'

    this._localConnections = new Map()
    this._remoteConnections = new Map()

    const remote = this._remote = Messenger((ctx, msg, tpc) => {
      try {
        const message = JSON.stringify({ctx, msg, tpc})
        this.emit('message', `G${message}`)
      } catch (e) {
        console.error('CONNECTION_ERROR -', e, e.stack)
      }
    })

    remote.on('init', ({message, send, done}) => {
      this[STATE] = 'running'
      this.emit('running')
      done()
    })

    remote.on('streamAdded', ({message, send, done}) => {
      const {id, meta} = message

      const conn = this._createRemoteConnection(id)
      conn.on('stream', stream => {
        this.emit('streamAdded', stream, id, meta)
      })
      this._registerRemoteConnection(id, conn)
      done()
    })

    remote.on('streamRemoved', ({message, send, done}) => {
      const {id} = message
      const conn = this._remoteConnections.get(id)
      if (!conn) {
        return done()
      }
      this._remoteConnections.delete(id)
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
      const conn = this._localConnections.get(id)
      if (!conn) {
        return done({streamNotFound: true})
      }
      const stream = conn.getStream()
      conn.close()
      this._localConnections.delete(id)

      send().then(({message, send, done}) => {
        this._createLocalConnection(stream)
      })
    })

    this.on('closed', () => {
      for (let localConn of this._localConnections.values()) {
        localConn.close()
      }
      for (let remoteConn of this._remoteConnections.values()) {
        remoteConn.close()
      }
      this._localConnections.clear()
      this._remoteConnections.clear()
    })
  }

  state () {
    return this[STATE]
  }

  open () {
    this._remote.send('init')
    return this
  }

  write (message) {
    if (this.state() !== 'running') return

    switch (message[0]) {
      case 'L':
        const lid = message.substr(MSG_TYPE_LEN, STREAM_ID_LEN)
        const lconn = this._localConnections.get(lid)
        if (!lconn) return
        lconn.write(message.slice(MSG_TYPE_LEN + STREAM_ID_LEN))
        break

      case 'R':
        const rid = message.substr(MSG_TYPE_LEN, STREAM_ID_LEN)
        const rconn = this._remoteConnections.get(rid)
        if (!rconn) return
        rconn.write(message.slice(MSG_TYPE_LEN + STREAM_ID_LEN))
        break

      case 'G':
        try {
          const {ctx, msg, tpc} = JSON.parse(message.slice(1))
          this._remote.accept(ctx, msg, tpc)
        } catch (e) {}
    }

    return this
  }

  addStream (stream, meta) {
    if (this.state() !== 'running') return

    this._remote.send('streamAdded', {id: stream.id, meta})
      .then(({mesage, send, done}) => {
        this._createLocalConnection(stream).open()
      })

    return this
  }

  removeStream (stream) {
    if (this.state() !== 'running') return

    const id = stream.id || stream
    this._remote.send('streamRemoved', {id})
      .then(({message, send, done}) => {
        const conn = this._localConnections.get(id)
        if (!conn) return
        this._localConnections.delete(id)
        conn.close()
      })

    return this
  }

  getLocalStreams () {
    if (this.state() !== 'running') return []

    return Array.from(this._localConnections.values())
      .map(conn => conn.getStream())
  }

  getRemoteStreams () {
    if (this.state() !== 'running') return []

    return Array.from(this._remoteConnections.values())
      .map(conn => conn.getStream())
  }

  getStreamById (id) {
    const conn = this._localConnections.get(id) ||
                 this._remoteConnections.get(id)
    return conn && conn.getStream()
  }

  close (reason) {
    this[STATE] = 'closed'
    this._remote.send('closed', {reason})
    this.emit('closed', false, reason)
  }

  _sendFromConnection (conn, msg) {
    try {
      const type = conn.isSender() ? 'R' : 'L'
      const id = conn.getId()
      this.emit('message', type + id + msg)
    } catch (e) {}
  }

  _createLocalConnection (stream) {
    const id = stream.id
    const conn = this.adaptor.connect(stream, this.config)

    conn.on('message', msg => {
      this._sendFromConnection(conn, msg)
    })
    const prevConn = this._localConnections.get(id)
    if (prevConn) {
      prevConn.close()
    }
    this._localConnections.set(id, conn)
    return conn
  }

  _createRemoteConnection (id) {
    const conn = this.adaptor.receive(id, this.config)

    conn.on('message', msg => {
      this._sendFromConnection(conn, msg)
    })
    conn.on('closed', () => {
      if (!this._remoteConnections.get(id)) return
      this._remoteConnections.delete(id)

      this._remote.send('connectionClosed', {id})
        .then(({message, send, done}) => {
          const {streamNotFound} = message
          if (streamNotFound) return
          const conn = this._createRemoteConnection(id)
          conn.on('stream', stream => {
            this.emit('streamUpdated', stream, id)
          })
          this._registerRemoteConnection(id, conn)
          done()
        })
    })

    return conn
  }

  _registerRemoteConnection (id, conn) {
    const prevConn = this._remoteConnections.get(id)
    if (prevConn) {
      prevConn.close()
    }

    this._remoteConnections.set(id, conn)
  }
}
