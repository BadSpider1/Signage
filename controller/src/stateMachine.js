'use strict';

const EventEmitter = require('events');
const logger = require('./logger');

const STATES = Object.freeze({
  FALLBACK: 'FALLBACK',
  PROBING_STREAM: 'PROBING_STREAM',
  STREAM: 'STREAM',
});

// Valid transitions: from -> [allowed to states]
const VALID_TRANSITIONS = {
  [STATES.FALLBACK]: [STATES.PROBING_STREAM],
  [STATES.PROBING_STREAM]: [STATES.STREAM, STATES.FALLBACK],
  [STATES.STREAM]: [STATES.PROBING_STREAM, STATES.FALLBACK],
};

class StateMachine extends EventEmitter {
  constructor() {
    super();
    this._state = STATES.FALLBACK;
  }

  getState() {
    return this._state;
  }

  transition(newState, reason = '') {
    if (!STATES[newState]) {
      logger.error(`StateMachine: unknown state requested: ${newState}`);
      return false;
    }
    const allowed = VALID_TRANSITIONS[this._state] || [];
    if (!allowed.includes(newState)) {
      logger.warn(`StateMachine: invalid transition ${this._state} -> ${newState} ignored (reason: ${reason})`);
      return false;
    }
    const prev = this._state;
    this._state = newState;
    logger.info(`StateMachine: ${prev} -> ${newState}`, { reason });
    this.emit('transition', { from: prev, to: newState, reason });
    this.emit(`state:${newState}`, { from: prev, reason });
    return true;
  }
}

StateMachine.STATES = STATES;
module.exports = StateMachine;
