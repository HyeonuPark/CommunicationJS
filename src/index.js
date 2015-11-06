import {Connection} from './connection.js'

export default getConnection = config => new Connection(config)
