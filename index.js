'use strict'
import log from './src/logger.js'

process.on('unhandledRejection', (error) => {
  log.error(error)
});
import './src/index.js'
