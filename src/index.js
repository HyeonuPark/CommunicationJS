import {Communication} from './communication.js'

export default function getCommunication (config) {
  return new Communication(config)
}
