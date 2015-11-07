import {Connection} from './connection.js'

export default function getConnection (config) {
  return new Connection(config)
}
