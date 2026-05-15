var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// node_modules/afsm/node_modules/eventemitter3/index.js
var require_eventemitter3 = __commonJS({
  "node_modules/afsm/node_modules/eventemitter3/index.js"(exports, module) {
    "use strict";
    var has = Object.prototype.hasOwnProperty;
    var prefix = "~";
    function Events() {
    }
    if (Object.create) {
      Events.prototype = /* @__PURE__ */ Object.create(null);
      if (!new Events().__proto__) prefix = false;
    }
    function EE(fn, context, once) {
      this.fn = fn;
      this.context = context;
      this.once = once || false;
    }
    function addListener(emitter, event, fn, context, once) {
      if (typeof fn !== "function") {
        throw new TypeError("The listener must be a function");
      }
      var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
      if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
      else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
      else emitter._events[evt] = [emitter._events[evt], listener];
      return emitter;
    }
    function clearEvent(emitter, evt) {
      if (--emitter._eventsCount === 0) emitter._events = new Events();
      else delete emitter._events[evt];
    }
    function EventEmitter3() {
      this._events = new Events();
      this._eventsCount = 0;
    }
    EventEmitter3.prototype.eventNames = function eventNames() {
      var names = [], events, name;
      if (this._eventsCount === 0) return names;
      for (name in events = this._events) {
        if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
      }
      if (Object.getOwnPropertySymbols) {
        return names.concat(Object.getOwnPropertySymbols(events));
      }
      return names;
    };
    EventEmitter3.prototype.listeners = function listeners(event) {
      var evt = prefix ? prefix + event : event, handlers = this._events[evt];
      if (!handlers) return [];
      if (handlers.fn) return [handlers.fn];
      for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
        ee[i] = handlers[i].fn;
      }
      return ee;
    };
    EventEmitter3.prototype.listenerCount = function listenerCount(event) {
      var evt = prefix ? prefix + event : event, listeners = this._events[evt];
      if (!listeners) return 0;
      if (listeners.fn) return 1;
      return listeners.length;
    };
    EventEmitter3.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return false;
      var listeners = this._events[evt], len = arguments.length, args, i;
      if (listeners.fn) {
        if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
        switch (len) {
          case 1:
            return listeners.fn.call(listeners.context), true;
          case 2:
            return listeners.fn.call(listeners.context, a1), true;
          case 3:
            return listeners.fn.call(listeners.context, a1, a2), true;
          case 4:
            return listeners.fn.call(listeners.context, a1, a2, a3), true;
          case 5:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
          case 6:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
        }
        for (i = 1, args = new Array(len - 1); i < len; i++) {
          args[i - 1] = arguments[i];
        }
        listeners.fn.apply(listeners.context, args);
      } else {
        var length = listeners.length, j;
        for (i = 0; i < length; i++) {
          if (listeners[i].once) this.removeListener(event, listeners[i].fn, void 0, true);
          switch (len) {
            case 1:
              listeners[i].fn.call(listeners[i].context);
              break;
            case 2:
              listeners[i].fn.call(listeners[i].context, a1);
              break;
            case 3:
              listeners[i].fn.call(listeners[i].context, a1, a2);
              break;
            case 4:
              listeners[i].fn.call(listeners[i].context, a1, a2, a3);
              break;
            default:
              if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) {
                args[j - 1] = arguments[j];
              }
              listeners[i].fn.apply(listeners[i].context, args);
          }
        }
      }
      return true;
    };
    EventEmitter3.prototype.on = function on(event, fn, context) {
      return addListener(this, event, fn, context, false);
    };
    EventEmitter3.prototype.once = function once(event, fn, context) {
      return addListener(this, event, fn, context, true);
    };
    EventEmitter3.prototype.removeListener = function removeListener(event, fn, context, once) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return this;
      if (!fn) {
        clearEvent(this, evt);
        return this;
      }
      var listeners = this._events[evt];
      if (listeners.fn) {
        if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) {
          clearEvent(this, evt);
        }
      } else {
        for (var i = 0, events = [], length = listeners.length; i < length; i++) {
          if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) {
            events.push(listeners[i]);
          }
        }
        if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
        else clearEvent(this, evt);
      }
      return this;
    };
    EventEmitter3.prototype.removeAllListeners = function removeAllListeners(event) {
      var evt;
      if (event) {
        evt = prefix ? prefix + event : event;
        if (this._events[evt]) clearEvent(this, evt);
      } else {
        this._events = new Events();
        this._eventsCount = 0;
      }
      return this;
    };
    EventEmitter3.prototype.off = EventEmitter3.prototype.removeListener;
    EventEmitter3.prototype.addListener = EventEmitter3.prototype.on;
    EventEmitter3.prefixed = prefix;
    EventEmitter3.EventEmitter = EventEmitter3;
    if ("undefined" !== typeof module) {
      module.exports = EventEmitter3;
    }
  }
});

// node_modules/jv4-demuxer/node_modules/eventemitter3/index.js
var require_eventemitter32 = __commonJS({
  "node_modules/jv4-demuxer/node_modules/eventemitter3/index.js"(exports, module) {
    "use strict";
    var has = Object.prototype.hasOwnProperty;
    var prefix = "~";
    function Events() {
    }
    if (Object.create) {
      Events.prototype = /* @__PURE__ */ Object.create(null);
      if (!new Events().__proto__) prefix = false;
    }
    function EE(fn, context, once) {
      this.fn = fn;
      this.context = context;
      this.once = once || false;
    }
    function addListener(emitter, event, fn, context, once) {
      if (typeof fn !== "function") {
        throw new TypeError("The listener must be a function");
      }
      var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
      if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
      else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
      else emitter._events[evt] = [emitter._events[evt], listener];
      return emitter;
    }
    function clearEvent(emitter, evt) {
      if (--emitter._eventsCount === 0) emitter._events = new Events();
      else delete emitter._events[evt];
    }
    function EventEmitter3() {
      this._events = new Events();
      this._eventsCount = 0;
    }
    EventEmitter3.prototype.eventNames = function eventNames() {
      var names = [], events, name;
      if (this._eventsCount === 0) return names;
      for (name in events = this._events) {
        if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
      }
      if (Object.getOwnPropertySymbols) {
        return names.concat(Object.getOwnPropertySymbols(events));
      }
      return names;
    };
    EventEmitter3.prototype.listeners = function listeners(event) {
      var evt = prefix ? prefix + event : event, handlers = this._events[evt];
      if (!handlers) return [];
      if (handlers.fn) return [handlers.fn];
      for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
        ee[i] = handlers[i].fn;
      }
      return ee;
    };
    EventEmitter3.prototype.listenerCount = function listenerCount(event) {
      var evt = prefix ? prefix + event : event, listeners = this._events[evt];
      if (!listeners) return 0;
      if (listeners.fn) return 1;
      return listeners.length;
    };
    EventEmitter3.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return false;
      var listeners = this._events[evt], len = arguments.length, args, i;
      if (listeners.fn) {
        if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
        switch (len) {
          case 1:
            return listeners.fn.call(listeners.context), true;
          case 2:
            return listeners.fn.call(listeners.context, a1), true;
          case 3:
            return listeners.fn.call(listeners.context, a1, a2), true;
          case 4:
            return listeners.fn.call(listeners.context, a1, a2, a3), true;
          case 5:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
          case 6:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
        }
        for (i = 1, args = new Array(len - 1); i < len; i++) {
          args[i - 1] = arguments[i];
        }
        listeners.fn.apply(listeners.context, args);
      } else {
        var length = listeners.length, j;
        for (i = 0; i < length; i++) {
          if (listeners[i].once) this.removeListener(event, listeners[i].fn, void 0, true);
          switch (len) {
            case 1:
              listeners[i].fn.call(listeners[i].context);
              break;
            case 2:
              listeners[i].fn.call(listeners[i].context, a1);
              break;
            case 3:
              listeners[i].fn.call(listeners[i].context, a1, a2);
              break;
            case 4:
              listeners[i].fn.call(listeners[i].context, a1, a2, a3);
              break;
            default:
              if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) {
                args[j - 1] = arguments[j];
              }
              listeners[i].fn.apply(listeners[i].context, args);
          }
        }
      }
      return true;
    };
    EventEmitter3.prototype.on = function on(event, fn, context) {
      return addListener(this, event, fn, context, false);
    };
    EventEmitter3.prototype.once = function once(event, fn, context) {
      return addListener(this, event, fn, context, true);
    };
    EventEmitter3.prototype.removeListener = function removeListener(event, fn, context, once) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return this;
      if (!fn) {
        clearEvent(this, evt);
        return this;
      }
      var listeners = this._events[evt];
      if (listeners.fn) {
        if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) {
          clearEvent(this, evt);
        }
      } else {
        for (var i = 0, events = [], length = listeners.length; i < length; i++) {
          if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) {
            events.push(listeners[i]);
          }
        }
        if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
        else clearEvent(this, evt);
      }
      return this;
    };
    EventEmitter3.prototype.removeAllListeners = function removeAllListeners(event) {
      var evt;
      if (event) {
        evt = prefix ? prefix + event : event;
        if (this._events[evt]) clearEvent(this, evt);
      } else {
        this._events = new Events();
        this._eventsCount = 0;
      }
      return this;
    };
    EventEmitter3.prototype.off = EventEmitter3.prototype.removeListener;
    EventEmitter3.prototype.addListener = EventEmitter3.prototype.on;
    EventEmitter3.prefixed = prefix;
    EventEmitter3.EventEmitter = EventEmitter3;
    if ("undefined" !== typeof module) {
      module.exports = EventEmitter3;
    }
  }
});

// node_modules/afsm/index.js
var import_eventemitter3 = __toESM(require_eventemitter3(), 1);
var instance = /* @__PURE__ */ Symbol("instance");
var cacheResult = /* @__PURE__ */ Symbol("cacheResult");
var MiddleState = class {
  constructor(oldState, newState, action) {
    this.oldState = oldState;
    this.newState = newState;
    this.action = action;
    this.aborted = false;
  }
  abort(fsm) {
    this.aborted = true;
    setState.call(fsm, this.oldState, new Error(`action '${this.action}' aborted`));
  }
  toString() {
    return `${this.action}ing`;
  }
};
var FSMError = class extends Error {
  /*************  ✨ Codeium Command ⭐  *************/
  /**
     * Create a new instance of FSMError.
     * @param state current state.
     * @param message error message.
     * @param cause original error.
  /******  625fa23f-3ee1-42ac-94bd-4f6ffd4578ff  *******/
  constructor(state, message, cause) {
    super(message);
    this.state = state;
    this.message = message;
    this.cause = cause;
  }
};
function thenAble(val) {
  return typeof val === "object" && val && "then" in val;
}
var stateDiagram = /* @__PURE__ */ new Map();
function ChangeState(from, to, opt = {}) {
  return (target, propertyKey, descriptor) => {
    const action = opt.action || propertyKey;
    if (!opt.context) {
      const stateConfig = stateDiagram.get(target) || [];
      if (!stateDiagram.has(target))
        stateDiagram.set(target, stateConfig);
      stateConfig.push({ from, to, action });
    }
    const origin = descriptor.value;
    descriptor.value = function(...arg) {
      let fsm = this;
      if (opt.context) {
        fsm = FSM.get(typeof opt.context === "function" ? opt.context.call(this, ...arg) : opt.context);
      }
      if (fsm.state === to)
        return opt.sync ? fsm[cacheResult] : Promise.resolve(fsm[cacheResult]);
      else if (fsm.state instanceof MiddleState) {
        if (fsm.state.action == opt.abortAction) {
          fsm.state.abort(fsm);
        }
      }
      let err = null;
      if (Array.isArray(from)) {
        if (from.length == 0) {
          if (fsm.state instanceof MiddleState)
            fsm.state.abort(fsm);
        } else if (typeof fsm.state != "string" || !from.includes(fsm.state)) {
          err = new FSMError(fsm._state, `${fsm.name} ${action} to ${to} failed: current state ${fsm._state} not from ${from.join("|")}`);
        }
      } else {
        if (from !== fsm.state) {
          err = new FSMError(fsm._state, `${fsm.name} ${action} to ${to} failed: current state ${fsm._state} not from ${from}`);
        }
      }
      const returnErr = (err2) => {
        if (opt.fail)
          opt.fail.call(this, err2);
        if (opt.sync) {
          if (opt.ignoreError)
            return err2;
          throw err2;
        } else {
          if (opt.ignoreError)
            return Promise.resolve(err2);
          return Promise.reject(err2);
        }
      };
      if (err)
        return returnErr(err);
      const old = fsm.state;
      const middle = new MiddleState(old, to, action);
      setState.call(fsm, middle);
      const success = (result) => {
        var _a;
        fsm[cacheResult] = result;
        if (!middle.aborted) {
          setState.call(fsm, to);
          (_a = opt.success) === null || _a === void 0 ? void 0 : _a.call(this, fsm[cacheResult]);
        }
        return result;
      };
      const failed = (err2) => {
        setState.call(fsm, old, err2);
        return returnErr(err2);
      };
      try {
        const result = origin.apply(this, arg);
        if (thenAble(result))
          return result.then(success).catch(failed);
        else
          return opt.sync ? success(result) : Promise.resolve(success(result));
      } catch (err2) {
        return failed(new FSMError(fsm._state, `${fsm.name} ${action} from ${from} to ${to} failed: ${err2}`, err2 instanceof Error ? err2 : new Error(String(err2))));
      }
    };
  };
}
function Includes(...states) {
  return (target, propertyKey, descriptor) => {
    const origin = descriptor.value;
    const action = propertyKey;
    descriptor.value = function(...arg) {
      if (!states.includes(this.state.toString()))
        throw new FSMError(this.state, `${this.name} ${action} failed: current state ${this.state} not in ${states}`);
      return origin.apply(this, arg);
    };
  };
}
var sendDevTools = (() => {
  const hasDevTools = typeof window !== "undefined" && window["__AFSM__"];
  const inWorker = typeof importScripts !== "undefined";
  return hasDevTools ? (name, detail) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } : inWorker ? (type, payload) => {
    postMessage({ type, payload });
  } : () => {
  };
})();
function setState(value, err) {
  const old = this._state;
  this._state = value;
  const state = value.toString();
  if (value)
    this.emit(state, old);
  this.emit(FSM.STATECHANGED, value, old, err);
  this.updateDevTools({ value, old, err: err instanceof Error ? err.message : String(err) });
}
var FSM = class _FSM extends import_eventemitter3.default {
  constructor(name, groupName, prototype) {
    super();
    this.name = name;
    this.groupName = groupName;
    this._state = _FSM.INIT;
    if (!name)
      name = Date.now().toString(36);
    if (!prototype)
      prototype = Object.getPrototypeOf(this);
    else
      Object.setPrototypeOf(this, prototype);
    if (!groupName)
      this.groupName = this.constructor.name;
    const names = prototype[instance];
    if (!names)
      prototype[instance] = { name: this.name, count: 0 };
    else
      this.name = names.name + "-" + names.count++;
    this.updateDevTools({ diagram: this.stateDiagram });
  }
  get stateDiagram() {
    const protoType = Object.getPrototypeOf(this);
    const stateConfig = stateDiagram.get(protoType) || [];
    let result = /* @__PURE__ */ new Set();
    let plain = [];
    let forceTo = [];
    const allState = /* @__PURE__ */ new Set();
    const parent = Object.getPrototypeOf(protoType);
    if (stateDiagram.has(parent)) {
      parent.stateDiagram.forEach((stateDesc) => result.add(stateDesc));
      parent.allStates.forEach((state) => allState.add(state));
    }
    stateConfig.forEach(({ from, to, action }) => {
      if (typeof from === "string") {
        plain.push({ from, to, action });
      } else {
        if (from.length) {
          from.forEach((f) => {
            plain.push({ from: f, to, action });
          });
        } else
          forceTo.push({ to, action });
      }
    });
    plain.forEach(({ from, to, action }) => {
      allState.add(from);
      allState.add(to);
      allState.add(action + "ing");
      result.add(`${from} --> ${action}ing : ${action}`);
      result.add(`${action}ing --> ${to} : ${action} \u{1F7E2}`);
      result.add(`${action}ing --> ${from} : ${action} \u{1F534}`);
    });
    forceTo.forEach(({ to, action }) => {
      result.add(`${action}ing --> ${to} : ${action} \u{1F7E2}`);
      allState.forEach((f) => {
        if (f !== to)
          result.add(`${f} --> ${action}ing : ${action}`);
      });
    });
    const value = [...result];
    Object.defineProperties(protoType, {
      stateDiagram: { value },
      allStates: { value: allState }
    });
    return value;
  }
  static get(context) {
    let fsm;
    if (typeof context === "string") {
      fsm = _FSM.instances.get(context);
      if (!fsm) {
        _FSM.instances.set(context, fsm = new _FSM(context, void 0, Object.create(_FSM.prototype)));
      }
    } else {
      fsm = _FSM.instances2.get(context);
      if (!fsm) {
        _FSM.instances2.set(context, fsm = new _FSM(context.constructor.name, void 0, Object.create(_FSM.prototype)));
      }
    }
    return fsm;
  }
  static getState(context) {
    var _a;
    return (_a = _FSM.get(context)) === null || _a === void 0 ? void 0 : _a.state;
  }
  updateDevTools(payload = {}) {
    sendDevTools(_FSM.UPDATEAFSM, Object.assign({ name: this.name, group: this.groupName }, payload));
  }
  get state() {
    return this._state;
  }
  set state(value) {
    setState.call(this, value);
  }
};
FSM.STATECHANGED = "stateChanged";
FSM.UPDATEAFSM = "updateAFSM";
FSM.INIT = "[*]";
FSM.ON = "on";
FSM.OFF = "off";
FSM.instances = /* @__PURE__ */ new Map();
FSM.instances2 = /* @__PURE__ */ new WeakMap();

// node_modules/oput/dist/index.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var U32 = /* @__PURE__ */ Symbol(32);
var U16 = /* @__PURE__ */ Symbol(16);
var U8 = /* @__PURE__ */ Symbol(8);
var OPut = class {
  constructor(g) {
    this.g = g;
    this.consumed = 0;
    if (g)
      this.need = g.next().value;
  }
  setG(g) {
    this.g = g;
    this.demand(g.next().value, true);
  }
  consume() {
    if (this.buffer && this.consumed) {
      this.buffer.copyWithin(0, this.consumed);
      this.buffer = this.buffer.subarray(0, this.buffer.length - this.consumed);
      this.consumed = 0;
    }
  }
  demand(n, consume) {
    if (consume)
      this.consume();
    this.need = n;
    return this.flush();
  }
  read(need) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.lastReadPromise) {
        yield this.lastReadPromise;
      }
      return this.lastReadPromise = new Promise((resolve, reject) => {
        var _a;
        this.reject = reject;
        this.resolve = (data) => {
          delete this.lastReadPromise;
          delete this.resolve;
          delete this.need;
          resolve(data);
        };
        const result = this.demand(need, true);
        if (!result)
          (_a = this.pull) === null || _a === void 0 ? void 0 : _a.call(this, need);
      });
    });
  }
  readU32() {
    return this.read(U32);
  }
  readU16() {
    return this.read(U16);
  }
  readU8() {
    return this.read(U8);
  }
  close() {
    var _a;
    if (this.g)
      this.g.return();
    if (this.buffer)
      this.buffer.subarray(0, 0);
    (_a = this.reject) === null || _a === void 0 ? void 0 : _a.call(this, new Error("EOF"));
    delete this.lastReadPromise;
  }
  flush() {
    if (!this.buffer || !this.need)
      return;
    let returnValue = null;
    const unread = this.buffer.subarray(this.consumed);
    let n = 0;
    const notEnough = (x) => unread.length < (n = x);
    if (typeof this.need === "number") {
      if (notEnough(this.need))
        return;
      returnValue = unread.subarray(0, n);
    } else if (this.need === U32) {
      if (notEnough(4))
        return;
      returnValue = unread[0] << 24 | unread[1] << 16 | unread[2] << 8 | unread[3];
    } else if (this.need === U16) {
      if (notEnough(2))
        return;
      returnValue = unread[0] << 8 | unread[1];
    } else if (this.need === U8) {
      if (notEnough(1))
        return;
      returnValue = unread[0];
    } else if (!("buffer" in this.need)) {
      if (notEnough(this.need.byteLength))
        return;
      new Uint8Array(this.need).set(unread.subarray(0, n));
      returnValue = this.need;
    } else if ("byteOffset" in this.need) {
      if (notEnough(this.need.byteLength - this.need.byteOffset))
        return;
      new Uint8Array(this.need.buffer, this.need.byteOffset).set(unread.subarray(0, n));
      returnValue = this.need;
    } else if (this.g) {
      this.g.throw(new Error("Unsupported type"));
      return;
    }
    this.consumed += n;
    if (this.g)
      this.demand(this.g.next(returnValue).value, true);
    else if (this.resolve)
      this.resolve(returnValue);
    return returnValue;
  }
  write(value) {
    if (value instanceof Uint8Array) {
      this.malloc(value.length).set(value);
    } else if ("buffer" in value) {
      this.malloc(value.byteLength).set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    } else {
      this.malloc(value.byteLength).set(new Uint8Array(value));
    }
    if (this.g || this.resolve)
      this.flush();
    else
      return new Promise((resolve) => this.pull = resolve);
  }
  writeU32(value) {
    this.malloc(4).set([value >> 24 & 255, value >> 16 & 255, value >> 8 & 255, value & 255]);
    this.flush();
  }
  writeU16(value) {
    this.malloc(2).set([value >> 8 & 255, value & 255]);
    this.flush();
  }
  writeU8(value) {
    this.malloc(1)[0] = value;
    this.flush();
  }
  malloc(size) {
    if (this.buffer) {
      const l = this.buffer.length;
      const nl = l + size;
      if (nl <= this.buffer.buffer.byteLength - this.buffer.byteOffset) {
        this.buffer = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset, nl);
      } else {
        const n = new Uint8Array(nl);
        n.set(this.buffer);
        this.buffer = n;
      }
      return this.buffer.subarray(l, nl);
    } else {
      this.buffer = new Uint8Array(size);
      return this.buffer;
    }
  }
};
OPut.U32 = U32;
OPut.U16 = U16;
OPut.U8 = U8;

// node_modules/jv4-connection/src/base.ts
function fibonacci(n, ac1 = 1, ac2 = 1) {
  return n <= 1 ? ac2 : fibonacci(n - 1, ac2, ac1 + ac2);
}
function getReconnectionTimeout(reconnectionCount) {
  const n = Math.round(reconnectionCount / 2) + 1;
  return n > 6 ? 13 * 1e3 : fibonacci(n) * 1e3;
}
var TransmissionStatistics = class {
  constructor() {
    this.total = 0;
    this._buffer = 0;
    this.lastTime = 0;
    this._bps = 0;
  }
  add(size) {
    const now = Date.now();
    this._buffer += size;
    if (this.lastTime === 0) {
      this.lastTime = now;
    } else if (now - this.lastTime > 1e3) {
      this._bps = this._buffer * 1e3 / (now - this.lastTime) >> 0;
      this._buffer = 0;
      this.lastTime = now;
    }
    this.total += size;
  }
  get bps() {
    return Date.now() - this.lastTime > 5e3 ? 0 : this._bps;
  }
};
var Connection = class extends FSM {
  constructor(url, options = {}) {
    super(url || "conn", "Connection");
    this.url = url;
    this.options = options;
    this.up = new TransmissionStatistics();
    this.down = new TransmissionStatistics();
    this.underlyingSink = {
      write: async (chunk) => {
        this.down.add(chunk.length || chunk.byteLength);
        return this.oput?.write(chunk);
      }
    };
    if (!this.options.reconnectTimeout) {
      this.options.reconnectTimeout = getReconnectionTimeout;
    }
  }
  read(need) {
    return Promise.reject("not connected");
  }
  async connect() {
    this.abortCtrl = new AbortController();
    console.log(`connected: ${this.url}`);
    console.time(this.url);
    this.onConnected(await this._connect());
  }
  _close() {
  }
  _send(data) {
  }
  async reconnect() {
    console.log(`reconnect: ${this.url}`);
    console.time(this.url);
    this.abortCtrl = new AbortController();
    this.onConnected(await this._connect());
  }
  onConnected(readable) {
    console.timeEnd(this.url);
    if (!readable) return;
    if (!this.oput)
      this.oput = new OPut();
    this.read = this.oput.read.bind(this.oput);
    return readable.pipeTo(new WritableStream(this.underlyingSink), this.abortCtrl).catch((err) => {
      if (this.abortCtrl.signal.aborted) return;
      this.disconnect(err);
    });
  }
  disconnect(reason) {
    console.warn(`disconnect: ${this.url}`, reason);
    if (this.options.reconnectCount) this.reconnectAfter();
  }
  reconnectAfter(delay = 1e3, count = 0) {
    console.log(`reconnect after ${delay}ms`);
    setTimeout(() => {
      this.reconnect().catch((err) => {
        console.log(`reconnect failed: ${this.url}`, err);
        if (count < this.options.reconnectCount)
          this.reconnectAfter(this.options.reconnectTimeout(count), count + 1);
      });
    }, delay);
  }
  close() {
    this.abortCtrl?.abort();
    this._close();
  }
  send(data) {
    this.up.add(data.byteLength - ("byteOffset" in data ? data.byteOffset : 0));
    this._send(data);
  }
};
__decorateClass([
  Includes("connected" /* CONNECTED */)
], Connection.prototype, "read", 1);
__decorateClass([
  ChangeState(
    ["disconnected" /* DISCONNECTED */, FSM.INIT],
    "connected" /* CONNECTED */
  )
], Connection.prototype, "connect", 1);
__decorateClass([
  ChangeState("disconnected" /* DISCONNECTED */, "reconnected" /* RECONNECTED */)
], Connection.prototype, "reconnect", 1);
__decorateClass([
  ChangeState("connected" /* CONNECTED */, "disconnected" /* DISCONNECTED */, { sync: true })
], Connection.prototype, "disconnect", 1);
__decorateClass([
  ChangeState([], FSM.INIT, { sync: true })
], Connection.prototype, "close", 1);

// node_modules/jv4-connection/src/http.ts
var HttpConnection = class extends Connection {
  async _connect() {
    const res = await fetch(this.url, {
      ...this.options.requestInit,
      signal: this.abortCtrl.signal
    });
    if (!res.body) throw new Error("no body");
    return res.body;
  }
};

// node_modules/jv4-demuxer/src/base.ts
var import_eventemitter32 = __toESM(require_eventemitter32(), 1);
var DemuxEvent = /* @__PURE__ */ ((DemuxEvent2) => {
  DemuxEvent2["AUDIO_ENCODER_CONFIG_CHANGED"] = "audio-encoder-config-changed";
  DemuxEvent2["VIDEO_ENCODER_CONFIG_CHANGED"] = "video-encoder-config-changed";
  DemuxEvent2["DEMUX_ERROR"] = "demux-error";
  return DemuxEvent2;
})(DemuxEvent || {});
var DemuxMode = /* @__PURE__ */ ((DemuxMode2) => {
  DemuxMode2[DemuxMode2["PULL"] = 0] = "PULL";
  DemuxMode2[DemuxMode2["PUSH"] = 1] = "PUSH";
  return DemuxMode2;
})(DemuxMode || {});
var BaseDemuxer = class extends import_eventemitter32.EventEmitter {
  constructor(source, mode = 0 /* PULL */, format = "annexb") {
    super();
    this.source = source;
    this.mode = mode;
    this.format = format;
    console.log("Demuxer Created:", Object.getPrototypeOf(this).constructor.name);
    if (source) {
      if (mode == 0 /* PULL */) {
        this.startPull(source);
      } else {
        source.oput = new OPut(this.demux());
      }
    }
  }
  startPull(source) {
    this.mode = 0 /* PULL */;
    this.source = source;
    this.audioReadable = new ReadableStream({
      pull: async (controller) => controller.enqueue(await this.pullAudio())
    });
    this.videoReadable = new ReadableStream({
      pull: async (controller) => controller.enqueue(await this.pullVideo())
    });
  }
  pullAudio() {
    return new Promise((resolve, reject) => {
      this.gotAudio = resolve;
      if (!!this.gotVideo) this.pull().catch(reject);
    });
  }
  pullVideo() {
    return new Promise((resolve, reject) => {
      this.gotVideo = resolve;
      if (!!this.gotAudio) this.pull().catch(reject);
    });
  }
};

// node_modules/jv4-demuxer/src/util.ts
var samplingFrequencyIndexMap = [
  96e3,
  88200,
  64e3,
  48e3,
  44100,
  32e3,
  24e3,
  22050,
  16e3,
  12e3,
  11025,
  8e3,
  7350,
  -1,
  // reserved
  -1,
  // reserved
  -1
  // reserved
];
function avccToAnnexb(avcc, isKeyframe = false, parameterSets) {
  const startCode = new Uint8Array([0, 0, 0, 1]);
  let totalLength = 0;
  if (isKeyframe && parameterSets && parameterSets.length > 0) {
    for (const pSet of parameterSets) {
      if (pSet instanceof Uint8Array && pSet.length > 0) {
        totalLength += pSet.length + 4;
      }
    }
  }
  let avccNalusPayloadLength = 0;
  let avccOffsetScan = 0;
  while (avccOffsetScan < avcc.length) {
    if (avccOffsetScan + 4 > avcc.length) {
      break;
    }
    const naluLength = avcc[avccOffsetScan] << 24 | avcc[avccOffsetScan + 1] << 16 | avcc[avccOffsetScan + 2] << 8 | avcc[avccOffsetScan + 3];
    if (naluLength < 0 || avccOffsetScan + 4 + naluLength > avcc.length) {
      break;
    }
    avccNalusPayloadLength += naluLength + 4;
    avccOffsetScan += 4 + naluLength;
  }
  totalLength += avccNalusPayloadLength;
  const annexb = new Uint8Array(totalLength);
  let offset = 0;
  if (isKeyframe && parameterSets && parameterSets.length > 0) {
    for (const pSet of parameterSets) {
      if (pSet instanceof Uint8Array && pSet.length > 0) {
        if (offset + 4 + pSet.length > annexb.length) {
          console.error("Error writing parameter set: buffer overflow");
          return annexb.slice(0, offset);
        }
        annexb.set(startCode, offset);
        annexb.set(pSet, offset + 4);
        offset += pSet.length + 4;
      }
    }
  }
  avccOffsetScan = 0;
  while (avccOffsetScan < avcc.length) {
    if (avccOffsetScan + 4 > avcc.length) {
      break;
    }
    const naluLength = avcc[avccOffsetScan] << 24 | avcc[avccOffsetScan + 1] << 16 | avcc[avccOffsetScan + 2] << 8 | avcc[avccOffsetScan + 3];
    if (naluLength < 0 || avccOffsetScan + 4 + naluLength > avcc.length) {
      break;
    }
    if (offset + 4 + naluLength > annexb.length) {
      console.error("Error writing NALU from AVCC: buffer overflow");
      break;
    }
    annexb.set(startCode, offset);
    annexb.set(avcc.subarray(avccOffsetScan + 4, avccOffsetScan + 4 + naluLength), offset + 4);
    offset += naluLength + 4;
    avccOffsetScan += 4 + naluLength;
  }
  if (offset !== totalLength) {
    return annexb.slice(0, offset);
  }
  return annexb;
}
function extractParameterSetsFromAvcc(avccData) {
  const spsNalus = [];
  const ppsNalus = [];
  let offset = 0;
  if (!avccData || avccData.length < 7) {
    console.error("Invalid AVCC data: too short");
    return { sps: spsNalus, pps: ppsNalus };
  }
  offset += 5;
  const numOfSPS = avccData[offset++] & 31;
  for (let i = 0; i < numOfSPS; i++) {
    if (offset + 2 > avccData.length) {
      console.error("Invalid AVCC data: not enough bytes for SPS length");
      break;
    }
    const spsLength = avccData[offset] << 8 | avccData[offset + 1];
    offset += 2;
    if (offset + spsLength > avccData.length) {
      console.error("Invalid AVCC data: not enough bytes for SPS NAL unit");
      break;
    }
    spsNalus.push(avccData.subarray(offset, offset + spsLength));
    offset += spsLength;
  }
  if (offset + 1 > avccData.length) {
    if (numOfSPS > 0 && spsNalus.length === numOfSPS) {
    }
    return { sps: spsNalus, pps: ppsNalus };
  }
  const numOfPPS = avccData[offset++];
  for (let i = 0; i < numOfPPS; i++) {
    if (offset + 2 > avccData.length) {
      console.error("Invalid AVCC data: not enough bytes for PPS length");
      break;
    }
    const ppsLength = avccData[offset] << 8 | avccData[offset + 1];
    offset += 2;
    if (offset + ppsLength > avccData.length) {
      console.error("Invalid AVCC data: not enough bytes for PPS NAL unit");
      break;
    }
    ppsNalus.push(avccData.subarray(offset, offset + ppsLength));
    offset += ppsLength;
  }
  return { sps: spsNalus, pps: ppsNalus };
}
function extractParameterSetsFromHvcc(hvccData) {
  const vpsNalus = [];
  const spsNalus = [];
  const ppsNalus = [];
  let offset = 0;
  if (!hvccData || hvccData.length < 23) {
    console.error("Invalid HVCC data: too short for header");
    return { vps: vpsNalus, sps: spsNalus, pps: ppsNalus };
  }
  offset += 22;
  const numOfArrays = hvccData[offset++];
  if (offset + numOfArrays * 3 > hvccData.length) {
    console.error("Invalid HVCC data: numOfArrays inconsistent with data length");
    return { vps: vpsNalus, sps: spsNalus, pps: ppsNalus };
  }
  for (let i = 0; i < numOfArrays; i++) {
    if (offset + 3 > hvccData.length) {
      console.error("Invalid HVCC data: not enough bytes for NAL unit array header");
      break;
    }
    const nalUnitType = hvccData[offset] & 63;
    offset++;
    const numNalus = hvccData[offset] << 8 | hvccData[offset + 1];
    offset += 2;
    let innerLoopBroken = false;
    for (let j = 0; j < numNalus; j++) {
      if (offset + 2 > hvccData.length) {
        console.error("Invalid HVCC data: not enough bytes for NAL unit length");
        innerLoopBroken = true;
        break;
      }
      const nalUnitLength = hvccData[offset] << 8 | hvccData[offset + 1];
      offset += 2;
      if (offset + nalUnitLength > hvccData.length) {
        console.error("Invalid HVCC data: not enough bytes for NAL unit data");
        innerLoopBroken = true;
        break;
      }
      const nalUnit = hvccData.subarray(offset, offset + nalUnitLength);
      offset += nalUnitLength;
      switch (nalUnitType) {
        case 32:
          vpsNalus.push(nalUnit);
          break;
        case 33:
          spsNalus.push(nalUnit);
          break;
        case 34:
          ppsNalus.push(nalUnit);
          break;
        default:
          break;
      }
    }
    if (innerLoopBroken) {
      break;
    }
  }
  return { vps: vpsNalus, sps: spsNalus, pps: ppsNalus };
}

// node_modules/jv4-demuxer/src/flv.ts
var FourCC_H265 = "hvc1";
var FourCC_AV1 = "av01";
var FlvDemuxer = class extends BaseDemuxer {
  constructor() {
    super(...arguments);
    this.tmp8 = new Uint8Array(4);
    this.dv = new DataView(this.tmp8.buffer);
  }
  async pullTag() {
    const t = new Uint8Array(15);
    this.pullTag = async () => {
      await this.source.read(t);
      const type = t[4];
      const length = this.readLength(t.subarray(5, 8));
      const timestamp = this.readTimestamp(t.subarray(8, 11));
      const data = await this.source.read(length);
      return { type, data: data.slice(), timestamp };
    };
    console.time("flv");
    await this.source.read(9).then((data) => {
      this.header = data;
      console.log(data);
      if (data.subarray(0, 3).reduce((acc, cur) => acc + String.fromCharCode(cur), "") !== "FLV") {
        throw new Error("not flv");
      }
      console.timeEnd("flv");
    });
    return this.pullTag();
  }
  readTag(data) {
    const type = data[0];
    const length = this.readLength(data.subarray(1, 4));
    const timestamp = this.readTimestamp(data.subarray(4, 8));
    this.gotTag(type, data.subarray(11, 11 + length), timestamp);
  }
  gotTag(type, data, timestamp) {
    switch (type) {
      case 8:
        if (!this.audioDecoderConfig) {
          this.audioDecoderConfig = {
            codec: { 10: "aac", 7: "pcma", 8: "pcmu" }[data[0] >> 4] || "unknown",
            numberOfChannels: 1,
            sampleRate: 8e3
          };
          if (this.audioDecoderConfig.codec == "aac") {
            this.audioDecoderConfig.numberOfChannels = data[3] >> 3 & 15;
            this.audioDecoderConfig.sampleRate = samplingFrequencyIndexMap[(data[2] & 7) << 1 | data[3] >> 7];
          } else {
            this.emit(
              "audio-encoder-config-changed" /* AUDIO_ENCODER_CONFIG_CHANGED */,
              this.audioDecoderConfig
            );
          }
        }
        if (this.audioDecoderConfig.codec == "aac") {
          if (data[1] == 0) {
            this.audioDecoderConfig.description = data.subarray(2);
            this.emit(
              "audio-encoder-config-changed" /* AUDIO_ENCODER_CONFIG_CHANGED */,
              this.audioDecoderConfig
            );
            if (this.mode == 0 /* PULL */) return this.pull();
            else return;
          }
        }
        return this.gotAudio?.({
          type: "key",
          data: this.audioDecoderConfig.codec == "aac" ? data.subarray(2) : data.subarray(1),
          timestamp,
          duration: 0
        });
      case 9:
        if (data[0] >> 7) {
          const packetType = data[0] & 15;
          if (packetType) {
            const isKeyframe2 = (data[0] & 112) >> 4 == 1;
            const isCodedFramesX = packetType === 3;
            const videoData2 = data.subarray(isCodedFramesX ? 5 : 8);
            return this.gotVideo?.({
              type: isKeyframe2 ? "key" : "delta",
              data: this.format === "annexb" && this.videoDecoderConfig?.codec !== "av1" ? avccToAnnexb(videoData2, isKeyframe2, this.videoDecoderConfig.parameterSets) : videoData2,
              timestamp,
              duration: 0
            });
          } else {
            switch (data.subarray(1, 5).reduce((acc, cur) => acc + String.fromCharCode(cur), "")) {
              case FourCC_H265:
                const videoDecoderConfig = {
                  codec: "hevc",
                  description: data.subarray(5)
                };
                if (this.format === "annexb") {
                  const params = extractParameterSetsFromHvcc(videoDecoderConfig.description);
                  this.videoDecoderConfig = {
                    codec: "hevc",
                    parameterSets: [
                      params.vps[0],
                      params.sps[0],
                      params.pps[0]
                    ]
                  };
                } else {
                  this.videoDecoderConfig = videoDecoderConfig;
                }
                break;
              case FourCC_AV1:
                this.videoDecoderConfig = {
                  codec: "av1"
                };
                break;
            }
            this.emit(
              "video-encoder-config-changed" /* VIDEO_ENCODER_CONFIG_CHANGED */,
              this.videoDecoderConfig
            );
            if (this.mode == 0 /* PULL */) return this.pull();
            else return;
          }
        } else if (data[1] === 0) {
          const videoDecoderConfig = {
            codec: { 7: "avc", 12: "hevc", 13: "av1" }[data[0] & 15] || "unknown",
            description: data.subarray(5)
          };
          if (videoDecoderConfig.codec == "av1") {
            this.videoDecoderConfig = {
              codec: "av1"
            };
          } else {
            if (this.format === "annexb") {
              const isHevc = videoDecoderConfig.codec === "hevc";
              let parameterSets = [];
              if (isHevc) {
                const params = extractParameterSetsFromAvcc(videoDecoderConfig.description);
                parameterSets = [
                  params.vps[0],
                  params.sps[0],
                  params.pps[0]
                ];
              } else {
                const params = extractParameterSetsFromAvcc(videoDecoderConfig.description);
                parameterSets = [
                  params.sps[0],
                  params.pps[0]
                ];
              }
              this.videoDecoderConfig = {
                codec: videoDecoderConfig.codec,
                parameterSets
              };
            } else {
              this.videoDecoderConfig = videoDecoderConfig;
            }
          }
          this.emit(
            "video-encoder-config-changed" /* VIDEO_ENCODER_CONFIG_CHANGED */,
            this.videoDecoderConfig
          );
          if (this.mode == 0 /* PULL */) return this.pull();
          else return;
        }
        const isKeyframe = data[0] >> 4 == 1;
        const videoData = data.subarray(5);
        return this.gotVideo?.({
          type: isKeyframe ? "key" : "delta",
          data: this.format === "annexb" && this.videoDecoderConfig?.codec !== "av1" ? avccToAnnexb(videoData, isKeyframe, this.videoDecoderConfig.parameterSets) : videoData,
          timestamp,
          duration: 0
        });
      default:
        if (this.mode == 0 /* PULL */) return this.pull();
    }
  }
  async pull() {
    const value = await this.pullTag();
    if (value) {
      return this.gotTag(value.type, value.data, value.timestamp);
    }
  }
  readLength(data) {
    this.tmp8[0] = 0;
    this.tmp8.set(data, 1);
    return this.dv.getUint32(0);
  }
  readTimestamp(data) {
    this.tmp8.set(data.subarray(0, 3), 1);
    let timestamp = this.dv.getUint32(0);
    if (timestamp === 16777215) {
      this.tmp8[0] = data[3];
      timestamp = this.dv.getUint32(0);
    }
    return timestamp;
  }
  readHead(data) {
    console.time("flv");
    this.header = data;
    console.log(data);
    if (data.subarray(0, 3).reduce((acc, cur) => acc + String.fromCharCode(cur), "") !== "FLV") {
      throw new Error("not flv");
    }
    console.timeEnd("flv");
  }
  *demux() {
    this.readHead(yield 13);
    while (true) {
      let data = yield 11;
      const type = data[0];
      const length = this.readLength(data.subarray(1, 4));
      const timestamp = this.readTimestamp(data.subarray(4, 8));
      data = yield length;
      this.gotTag(type, data.slice(), timestamp);
      yield 4;
    }
  }
};

// node_modules/jv4-decoder/src/types.ts
var VideoDecoderEvent = /* @__PURE__ */ ((VideoDecoderEvent2) => {
  VideoDecoderEvent2["VideoCodecInfo"] = "videoCodecInfo";
  VideoDecoderEvent2["VideoFrame"] = "videoFrame";
  VideoDecoderEvent2["Error"] = "error";
  return VideoDecoderEvent2;
})(VideoDecoderEvent || {});

// node_modules/jv4-decoder/src/video_decoder_soft_base.ts
function WorkerScripts() {
  var decoder;
  self.onmessage = (evt) => {
    if (evt.data.type === "init") {
      const { canvas, wasmScript, wasmBinary } = evt.data;
      const gl = canvas?.getContext("2d");
      let width = 0;
      let height = 0;
      let pendingFrame = null;
      let pendingPts = 0;
      let droppedFrames = 0;
      const renderIntervalMs = 25;
      const drawPendingFrame = () => {
        if (!canvas || !gl || !pendingFrame) return;
        const frame = pendingFrame;
        const pts = pendingPts;
        pendingFrame = null;
        const startedAt = performance.now();
        try {
          gl.drawImage(frame, 0, 0, canvas.width, canvas.height);
          self.postMessage({
            type: "rendered",
            pts,
            at: performance.now(),
            costMs: performance.now() - startedAt,
            dropped: droppedFrames
          });
          droppedFrames = 0;
        } finally {
          frame.close();
        }
      };
      const renderTimer = canvas ? setInterval(drawPendingFrame, renderIntervalMs) : 0;
      const module = {
        wasmBinary,
        postRun: () => {
          decoder = new module.VideoDecoder({
            videoInfo(w, h) {
              width = w;
              height = h;
              console.log("video info", w, h);
            },
            yuvData(yuvArray, pts) {
              const size = width * height;
              const halfSize = size >> 2;
              let yPtr = module.HEAPU32[yuvArray >> 2];
              let uPtr = module.HEAPU32[(yuvArray >> 2) + 1];
              let vPtr = module.HEAPU32[(yuvArray >> 2) + 2];
              let yBuf = module.HEAPU8.subarray(yPtr, yPtr + size);
              let uBuf = module.HEAPU8.subarray(uPtr, uPtr + halfSize);
              let vBuf = module.HEAPU8.subarray(vPtr, vPtr + halfSize);
              const data = new Uint8Array(size + halfSize + halfSize);
              data.set(yBuf);
              data.set(uBuf, size);
              data.set(vBuf, size + halfSize);
              const videoFrame = new VideoFrame(data, {
                codedWidth: width,
                codedHeight: height,
                format: "I420",
                timestamp: pts
              });
              if (canvas) {
                if (pendingFrame) {
                  pendingFrame.close();
                  droppedFrames += 1;
                }
                self.postMessage({ type: "decoded", pts, at: performance.now() });
                pendingFrame = videoFrame;
                pendingPts = pts;
              } else {
                self.postMessage({ type: "yuvData", videoFrame }, [videoFrame]);
              }
            }
          });
          self.postMessage({ type: "ready" });
        }
      };
      Function("var _scriptDir = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : undefined;return " + wasmScript)()(module);
    } else if (evt.data.type === "decode") {
      const { packet } = evt.data;
      decoder?.decode(packet.data, packet.type == "key", packet.timestamp);
    } else if (evt.data.type === "setCodec") {
      const { codec, format, description } = evt.data;
      decoder?.setCodec(codec, format, description ?? "");
    }
  };
}
var VideoDecoderSoftBase = class extends FSM {
  constructor(createModule, wasmBinary, workerMode = false, canvas, yuvMode = false) {
    super();
    this.createModule = createModule;
    this.wasmBinary = wasmBinary;
    this.workerMode = workerMode;
    this.canvas = canvas;
    this.yuvMode = yuvMode;
    this.module = {};
    this.width = 0;
    this.height = 0;
  }
  async initialize(opt) {
    if (this.workerMode) {
      const script = /\{(.+)\}/s.exec(WorkerScripts.toString())[1];
      this.worker = new Worker(URL.createObjectURL(new Blob([script], { type: "text/javascript" })));
      const offsetCanvas = this.canvas?.transferControlToOffscreen();
      const wasmBinary = await this.wasmBinary;
      console.warn("worker mode", wasmBinary);
      this.worker.postMessage({ type: "init", canvas: offsetCanvas, wasmScript: this.createModule.toString(), wasmBinary }, offsetCanvas ? [offsetCanvas, wasmBinary] : [wasmBinary]);
      return new Promise((resolve) => {
        this.worker.onmessage = (evt) => {
          if (evt.data.type === "ready") {
            delete this.wasmBinary;
            resolve();
            console.warn(`worker mode initialize success`);
          } else if (evt.data.type === "yuvData") {
            const { videoFrame } = evt.data;
            this.emit("videoFrame" /* VideoFrame */, videoFrame);
          } else if (evt.data.type === "decoded") {
            this.emit("decoded", evt.data);
          } else if (evt.data.type === "rendered") {
            this.emit("rendered", evt.data);
          }
        };
      });
    }
    const opts = this.module;
    if (this.wasmBinary) {
      opts.wasmBinary = await this.wasmBinary;
    }
    opts.print = ((text) => console.log(text));
    opts.printErr = ((text) => console.log(`[JS] ERROR: ${text}`));
    opts.onAbort = (() => console.log("[JS] FATAL: WASM ABORTED"));
    return new Promise((resolve) => {
      opts.postRun = ((m) => {
        this.decoder = new this.module.VideoDecoder(this);
        console.log(`video soft decoder initialize success`);
        resolve();
      });
      if (opt) Object.assign(opts, opt);
      this.createModule(opts);
    });
  }
  configure(config) {
    this.config = config;
    const codec = this.config.codec.startsWith("avc") ? "avc" : "hevc";
    const format = this.config.description ? codec == "avc" ? "avcc" : "hvcc" : "annexb";
    this.decoder?.setCodec(codec, format, this.config.description ?? "");
    this.worker?.postMessage({ type: "setCodec", codec, format, description: this.config.description });
  }
  decode(packet) {
    this.decoder?.decode(packet.data, packet.type == "key", packet.timestamp);
    if (this.state === "configured") this.worker?.postMessage({ type: "decode", packet });
  }
  flush() {
  }
  reset() {
    this.config = void 0;
    if (this.decoder) {
      this.decoder.clear();
    }
  }
  close() {
    this.removeAllListeners();
    if (this.worker) {
      this.worker.terminate();
      this.worker = void 0;
    }
    if (this.decoder) {
      this.decoder.clear();
      this.decoder.delete();
    }
  }
  // wasm callback function
  videoInfo(width, height) {
    this.width = width;
    this.height = height;
    let videoCodeInfo = {
      width,
      height
    };
    this.emit("videoCodecInfo" /* VideoCodecInfo */, videoCodeInfo);
  }
  yuvData(yuvArray, pts) {
    if (!this.module) {
      return;
    }
    const size = this.width * this.height;
    const halfSize = size >> 2;
    let yPtr = this.module.HEAPU32[yuvArray >> 2];
    let uPtr = this.module.HEAPU32[(yuvArray >> 2) + 1];
    let vPtr = this.module.HEAPU32[(yuvArray >> 2) + 2];
    let yBuf = this.module.HEAPU8.subarray(yPtr, yPtr + size);
    let uBuf = this.module.HEAPU8.subarray(uPtr, uPtr + halfSize);
    let vBuf = this.module.HEAPU8.subarray(vPtr, vPtr + halfSize);
    if (this.yuvMode) {
      this.emit("videoFrame" /* VideoFrame */, { y: yBuf, u: uBuf, v: vBuf, timestamp: pts });
      return;
    }
    const data = new Uint8Array(size + halfSize + halfSize);
    data.set(yBuf);
    data.set(uBuf, size);
    data.set(vBuf, size + halfSize);
    this.emit("videoFrame" /* VideoFrame */, new VideoFrame(data, {
      codedWidth: this.width,
      codedHeight: this.height,
      format: "I420",
      timestamp: pts
    }));
  }
  errorInfo(errormsg) {
    let err = {
      errMsg: errormsg
    };
    this.emit("error" /* Error */, err);
  }
};
__decorateClass([
  ChangeState([FSM.INIT, "closed"], "initialized")
], VideoDecoderSoftBase.prototype, "initialize", 1);
__decorateClass([
  ChangeState("initialized", "configured", { sync: true })
], VideoDecoderSoftBase.prototype, "configure", 1);
__decorateClass([
  ChangeState([], FSM.INIT, { sync: true })
], VideoDecoderSoftBase.prototype, "reset", 1);
__decorateClass([
  ChangeState([], "closed", { sync: true })
], VideoDecoderSoftBase.prototype, "close", 1);

// node_modules/jv4-decoder/wasm/types/videodec_simd.js
var Module = (() => {
  var _scriptDir = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : void 0;
  return (function(moduleArg = {}) {
    var Module2 = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    Module2["ready"] = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var moduleOverrides = Object.assign({}, Module2);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module2["locateFile"]) {
        return Module2["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_, readAsync, readBinary, setWindowTitle;
    if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptDir) {
        scriptDirectory = _scriptDir;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
      } else {
        scriptDirectory = "";
      }
      {
        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.send(null);
          return xhr.responseText;
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = () => {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
      setWindowTitle = (title) => document.title = title;
    } else {
    }
    var out = Module2["print"] || console.log.bind(console);
    var err = Module2["printErr"] || console.error.bind(console);
    Object.assign(Module2, moduleOverrides);
    moduleOverrides = null;
    if (Module2["arguments"]) arguments_ = Module2["arguments"];
    if (Module2["thisProgram"]) thisProgram = Module2["thisProgram"];
    if (Module2["quit"]) quit_ = Module2["quit"];
    var wasmBinary;
    if (Module2["wasmBinary"]) wasmBinary = Module2["wasmBinary"];
    var noExitRuntime = Module2["noExitRuntime"] || true;
    if (typeof WebAssembly != "object") {
      abort("no native wasm support detected");
    }
    var wasmMemory;
    var wasmExports;
    var ABORT = false;
    var EXITSTATUS;
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module2["HEAP8"] = HEAP8 = new Int8Array(b);
      Module2["HEAP16"] = HEAP16 = new Int16Array(b);
      Module2["HEAP32"] = HEAP32 = new Int32Array(b);
      Module2["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module2["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module2["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module2["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module2["HEAPF64"] = HEAPF64 = new Float64Array(b);
    }
    var wasmTable;
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module2["preRun"]) {
        if (typeof Module2["preRun"] == "function") Module2["preRun"] = [Module2["preRun"]];
        while (Module2["preRun"].length) {
          addOnPreRun(Module2["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__ATINIT__);
    }
    function postRun() {
      if (Module2["postRun"]) {
        if (typeof Module2["postRun"] == "function") Module2["postRun"] = [Module2["postRun"]];
        while (Module2["postRun"].length) {
          addOnPostRun(Module2["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      if (Module2["monitorRunDependencies"]) {
        Module2["monitorRunDependencies"](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module2["monitorRunDependencies"]) {
        Module2["monitorRunDependencies"](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      if (Module2["onAbort"]) {
        Module2["onAbort"](what);
      }
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      EXITSTATUS = 1;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    function isDataURI(filename) {
      return filename.startsWith(dataURIPrefix);
    }
    var wasmBinaryFile;
    wasmBinaryFile = "videodec_simd.wasm";
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile);
    }
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch == "function") {
          return fetch(binaryFile, { credentials: "same-origin" }).then((response) => {
            if (!response["ok"]) {
              throw "failed to load wasm binary file at '" + binaryFile + "'";
            }
            return response["arrayBuffer"]();
          }).catch(() => getBinarySync(binaryFile));
        }
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile).then((binary) => WebAssembly.instantiate(binary, imports)).then((instance2) => instance2).then(receiver, (reason) => {
        err("failed to asynchronously prepare wasm: " + reason);
        abort(reason);
      });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && typeof fetch == "function") {
        return fetch(binaryFile, { credentials: "same-origin" }).then((response) => {
          var result = WebAssembly.instantiateStreaming(response, imports);
          return result.then(callback, function(reason) {
            err("wasm streaming compile failed: " + reason);
            err("falling back to ArrayBuffer instantiation");
            return instantiateArrayBuffer(binaryFile, imports, callback);
          });
        });
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function createWasm() {
      var info = { "a": wasmImports };
      function receiveInstance(instance2, module) {
        var exports = instance2.exports;
        wasmExports = exports;
        wasmMemory = wasmExports["v"];
        updateMemoryViews();
        wasmTable = wasmExports["z"];
        addOnInit(wasmExports["w"]);
        removeRunDependency("wasm-instantiate");
        return exports;
      }
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"]);
      }
      if (Module2["instantiateWasm"]) {
        try {
          return Module2["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err("Module.instantiateWasm callback failed with error: " + e);
          readyPromiseReject(e);
        }
      }
      instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
      return {};
    }
    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module2);
      }
    };
    function ExceptionInfo(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
      this.set_type = function(type) {
        HEAPU32[this.ptr + 4 >> 2] = type;
      };
      this.get_type = function() {
        return HEAPU32[this.ptr + 4 >> 2];
      };
      this.set_destructor = function(destructor) {
        HEAPU32[this.ptr + 8 >> 2] = destructor;
      };
      this.get_destructor = function() {
        return HEAPU32[this.ptr + 8 >> 2];
      };
      this.set_caught = function(caught) {
        caught = caught ? 1 : 0;
        HEAP8[this.ptr + 12 >> 0] = caught;
      };
      this.get_caught = function() {
        return HEAP8[this.ptr + 12 >> 0] != 0;
      };
      this.set_rethrown = function(rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[this.ptr + 13 >> 0] = rethrown;
      };
      this.get_rethrown = function() {
        return HEAP8[this.ptr + 13 >> 0] != 0;
      };
      this.init = function(type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      };
      this.set_adjusted_ptr = function(adjustedPtr) {
        HEAPU32[this.ptr + 16 >> 2] = adjustedPtr;
      };
      this.get_adjusted_ptr = function() {
        return HEAPU32[this.ptr + 16 >> 2];
      };
      this.get_exception_ptr = function() {
        var isPointer = ___cxa_is_pointer_type(this.get_type());
        if (isPointer) {
          return HEAPU32[this.excPtr >> 2];
        }
        var adjusted = this.get_adjusted_ptr();
        if (adjusted !== 0) return adjusted;
        return this.excPtr;
      };
    }
    var exceptionLast = 0;
    var uncaughtExceptionCount = 0;
    function ___cxa_throw(ptr, type, destructor) {
      var info = new ExceptionInfo(ptr);
      info.init(type, destructor);
      exceptionLast = ptr;
      uncaughtExceptionCount++;
      throw exceptionLast;
    }
    function __embind_register_bigint(primitiveType, name, size, minRange, maxRange) {
    }
    function getShiftFromSize(size) {
      switch (size) {
        case 1:
          return 0;
        case 2:
          return 1;
        case 4:
          return 2;
        case 8:
          return 3;
        default:
          throw new TypeError(`Unknown type size: ${size}`);
      }
    }
    function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }
    var embind_charCodes = void 0;
    function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
    var awaitingDependencies = {};
    var registeredTypes = {};
    var typeDependencies = {};
    var BindingError = void 0;
    function throwBindingError(message) {
      throw new BindingError(message);
    }
    var InternalError = void 0;
    function throwInternalError(message) {
      throw new InternalError(message);
    }
    function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
        typeDependencies[type] = dependentTypes;
      });
      function onComplete(typeConverters2) {
        var myTypeConverters = getTypeConverters(typeConverters2);
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError("Mismatched type converter count");
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i]);
        }
      }
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach((dt, i) => {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt];
        } else {
          unregisteredTypes.push(dt);
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = [];
          }
          awaitingDependencies[dt].push(() => {
            typeConverters[i] = registeredTypes[dt];
            ++registered;
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters);
            }
          });
        }
      });
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters);
      }
    }
    function sharedRegisterType(rawType, registeredInstance, options = {}) {
      var name = registeredInstance.name;
      if (!rawType) {
        throwBindingError(`type "${name}" must have a positive integer typeid pointer`);
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return;
        } else {
          throwBindingError(`Cannot register type '${name}' twice`);
        }
      }
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType];
        delete awaitingDependencies[rawType];
        callbacks.forEach((cb) => cb());
      }
    }
    function registerType(rawType, registeredInstance, options = {}) {
      if (!("argPackAdvance" in registeredInstance)) {
        throw new TypeError("registerType registeredInstance requires argPackAdvance");
      }
      return sharedRegisterType(rawType, registeredInstance, options);
    }
    function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, { name, "fromWireType": function(wt) {
        return !!wt;
      }, "toWireType": function(destructors, o) {
        return o ? trueValue : falseValue;
      }, "argPackAdvance": 8, "readValueFromPointer": function(pointer) {
        var heap;
        if (size === 1) {
          heap = HEAP8;
        } else if (size === 2) {
          heap = HEAP16;
        } else if (size === 4) {
          heap = HEAP32;
        } else {
          throw new TypeError("Unknown boolean type size: " + name);
        }
        return this["fromWireType"](heap[pointer >> shift]);
      }, destructorFunction: null });
    }
    function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
        return false;
      }
      if (!(other instanceof ClassHandle)) {
        return false;
      }
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
      while (leftClass.baseClass) {
        left = leftClass.upcast(left);
        leftClass = leftClass.baseClass;
      }
      while (rightClass.baseClass) {
        right = rightClass.upcast(right);
        rightClass = rightClass.baseClass;
      }
      return leftClass === rightClass && left === right;
    }
    function shallowCopyInternalPointer(o) {
      return { count: o.count, deleteScheduled: o.deleteScheduled, preservePointerOnDelete: o.preservePointerOnDelete, ptr: o.ptr, ptrType: o.ptrType, smartPtr: o.smartPtr, smartPtrType: o.smartPtrType };
    }
    function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
    }
    var finalizationRegistry = false;
    function detachFinalizer(handle) {
    }
    function runDestructor($$) {
      if ($$.smartPtr) {
        $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
        $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }
    function releaseClassHandle($$) {
      $$.count.value -= 1;
      var toDelete = 0 === $$.count.value;
      if (toDelete) {
        runDestructor($$);
      }
    }
    function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
        return ptr;
      }
      if (void 0 === desiredClass.baseClass) {
        return null;
      }
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
        return null;
      }
      return desiredClass.downcast(rv);
    }
    var registeredPointers = {};
    function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
    function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
        if (registeredInstances.hasOwnProperty(k)) {
          rv.push(registeredInstances[k]);
        }
      }
      return rv;
    }
    var deletionQueue = [];
    function flushPendingDeletes() {
      while (deletionQueue.length) {
        var obj = deletionQueue.pop();
        obj.$$.deleteScheduled = false;
        obj["delete"]();
      }
    }
    var delayFunction = void 0;
    function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
    }
    function init_embind() {
      Module2["getInheritedInstanceCount"] = getInheritedInstanceCount;
      Module2["getLiveInheritedInstances"] = getLiveInheritedInstances;
      Module2["flushPendingDeletes"] = flushPendingDeletes;
      Module2["setDelayFunction"] = setDelayFunction;
    }
    var registeredInstances = {};
    function getBasestPointer(class_, ptr) {
      if (ptr === void 0) {
        throwBindingError("ptr should not be undefined");
      }
      while (class_.baseClass) {
        ptr = class_.upcast(ptr);
        class_ = class_.baseClass;
      }
      return ptr;
    }
    function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
    function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
        throwInternalError("makeClassHandle requires ptr and ptrType");
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
        throwInternalError("Both smartPtrType and smartPtr must be specified");
      }
      record.count = { value: 1 };
      return attachFinalizer(Object.create(prototype, { $$: { value: record } }));
    }
    function RegisteredPointer_fromWireType(ptr) {
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
        this.destructor(ptr);
        return null;
      }
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (void 0 !== registeredInstance) {
        if (0 === registeredInstance.$$.count.value) {
          registeredInstance.$$.ptr = rawPointer;
          registeredInstance.$$.smartPtr = ptr;
          return registeredInstance["clone"]();
        } else {
          var rv = registeredInstance["clone"]();
          this.destructor(ptr);
          return rv;
        }
      }
      function makeDefaultHandle() {
        if (this.isSmartPointer) {
          return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this.pointeeType, ptr: rawPointer, smartPtrType: this, smartPtr: ptr });
        } else {
          return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this, ptr });
        }
      }
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
        return makeDefaultHandle.call(this);
      }
      var toType;
      if (this.isConst) {
        toType = registeredPointerRecord.constPointerType;
      } else {
        toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(rawPointer, this.registeredClass, toType.registeredClass);
      if (dp === null) {
        return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
        return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp, smartPtrType: this, smartPtr: ptr });
      } else {
        return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp });
      }
    }
    var attachFinalizer = function(handle) {
      if ("undefined" === typeof FinalizationRegistry) {
        attachFinalizer = (handle2) => handle2;
        return handle;
      }
      finalizationRegistry = new FinalizationRegistry((info) => {
        releaseClassHandle(info.$$);
      });
      attachFinalizer = (handle2) => {
        var $$ = handle2.$$;
        var hasSmartPtr = !!$$.smartPtr;
        if (hasSmartPtr) {
          var info = { $$ };
          finalizationRegistry.register(handle2, info, handle2);
        }
        return handle2;
      };
      detachFinalizer = (handle2) => finalizationRegistry.unregister(handle2);
      return attachFinalizer(handle);
    };
    function ClassHandle_clone() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.preservePointerOnDelete) {
        this.$$.count.value += 1;
        return this;
      } else {
        var clone = attachFinalizer(Object.create(Object.getPrototypeOf(this), { $$: { value: shallowCopyInternalPointer(this.$$) } }));
        clone.$$.count.value += 1;
        clone.$$.deleteScheduled = false;
        return clone;
      }
    }
    function ClassHandle_delete() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      detachFinalizer(this);
      releaseClassHandle(this.$$);
      if (!this.$$.preservePointerOnDelete) {
        this.$$.smartPtr = void 0;
        this.$$.ptr = void 0;
      }
    }
    function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
    function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }
    function init_ClassHandle() {
      ClassHandle.prototype["isAliasOf"] = ClassHandle_isAliasOf;
      ClassHandle.prototype["clone"] = ClassHandle_clone;
      ClassHandle.prototype["delete"] = ClassHandle_delete;
      ClassHandle.prototype["isDeleted"] = ClassHandle_isDeleted;
      ClassHandle.prototype["deleteLater"] = ClassHandle_deleteLater;
    }
    function ClassHandle() {
    }
    var char_0 = 48;
    var char_9 = 57;
    function makeLegalFunctionName(name) {
      if (void 0 === name) {
        return "_unknown";
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, "$");
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
        return `_${name}`;
      }
      return name;
    }
    function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      return { [name]: function() {
        return body.apply(this, arguments);
      } }[name];
    }
    function ensureOverloadTable(proto, methodName, humanName) {
      if (void 0 === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName];
        proto[methodName] = function() {
          if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
            throwBindingError(`Function '${humanName}' called with an invalid number of arguments (${arguments.length}) - expects one of (${proto[methodName].overloadTable})!`);
          }
          return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
        };
        proto[methodName].overloadTable = [];
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }
    function exposePublicSymbol(name, value, numArguments) {
      if (Module2.hasOwnProperty(name)) {
        if (void 0 === numArguments || void 0 !== Module2[name].overloadTable && void 0 !== Module2[name].overloadTable[numArguments]) {
          throwBindingError(`Cannot register public name '${name}' twice`);
        }
        ensureOverloadTable(Module2, name, name);
        if (Module2.hasOwnProperty(numArguments)) {
          throwBindingError(`Cannot register multiple overloads of a function with the same number of arguments (${numArguments})!`);
        }
        Module2[name].overloadTable[numArguments] = value;
      } else {
        Module2[name] = value;
        if (void 0 !== numArguments) {
          Module2[name].numArguments = numArguments;
        }
      }
    }
    function RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
    function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
        if (!ptrClass.upcast) {
          throwBindingError(`Expected null or instance of ${desiredClass.name}, got an instance of ${ptrClass.name}`);
        }
        ptr = ptrClass.upcast(ptr);
        ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }
    function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
      }
      if (!handle.$$.ptr) {
        throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        if (this.isSmartPointer) {
          ptr = this.rawConstructor();
          if (destructors !== null) {
            destructors.push(this.rawDestructor, ptr);
          }
          return ptr;
        } else {
          return 0;
        }
      }
      if (!handle.$$) {
        throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
      }
      if (!handle.$$.ptr) {
        throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
        throwBindingError(`Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      if (this.isSmartPointer) {
        if (void 0 === handle.$$.smartPtr) {
          throwBindingError("Passing raw pointer to smart pointer is illegal");
        }
        switch (this.sharingPolicy) {
          case 0:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              throwBindingError(`Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`);
            }
            break;
          case 1:
            ptr = handle.$$.smartPtr;
            break;
          case 2:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              var clonedHandle = handle["clone"]();
              ptr = this.rawShare(ptr, Emval.toHandle(function() {
                clonedHandle["delete"]();
              }));
              if (destructors !== null) {
                destructors.push(this.rawDestructor, ptr);
              }
            }
            break;
          default:
            throwBindingError("Unsupporting sharing policy");
        }
      }
      return ptr;
    }
    function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
      }
      if (!handle.$$.ptr) {
        throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
      }
      if (handle.$$.ptrType.isConst) {
        throwBindingError(`Cannot convert argument of type ${handle.$$.ptrType.name} to parameter type ${this.name}`);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function simpleReadValueFromPointer(pointer) {
      return this["fromWireType"](HEAP32[pointer >> 2]);
    }
    function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
        ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
    function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
        this.rawDestructor(ptr);
      }
    }
    function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
        handle["delete"]();
      }
    }
    function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype["argPackAdvance"] = 8;
      RegisteredPointer.prototype["readValueFromPointer"] = simpleReadValueFromPointer;
      RegisteredPointer.prototype["deleteObject"] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype["fromWireType"] = RegisteredPointer_fromWireType;
    }
    function RegisteredPointer(name, registeredClass, isReference, isConst, isSmartPointer, pointeeType, sharingPolicy, rawGetPointee, rawConstructor, rawShare, rawDestructor) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
      if (!isSmartPointer && registeredClass.baseClass === void 0) {
        if (isConst) {
          this["toWireType"] = constNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        } else {
          this["toWireType"] = nonConstNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        }
      } else {
        this["toWireType"] = genericPointerToWireType;
      }
    }
    function replacePublicSymbol(name, value, numArguments) {
      if (!Module2.hasOwnProperty(name)) {
        throwInternalError("Replacing nonexistant public symbol");
      }
      if (void 0 !== Module2[name].overloadTable && void 0 !== numArguments) {
        Module2[name].overloadTable[numArguments] = value;
      } else {
        Module2[name] = value;
        Module2[name].argCount = numArguments;
      }
    }
    var dynCallLegacy = (sig, ptr, args) => {
      var f = Module2["dynCall_" + sig];
      return args && args.length ? f.apply(null, [ptr].concat(args)) : f.call(null, ptr);
    };
    var wasmTableMirror = [];
    var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      return func;
    };
    var dynCall = (sig, ptr, args) => {
      if (sig.includes("j")) {
        return dynCallLegacy(sig, ptr, args);
      }
      var rtn = getWasmTableEntry(ptr).apply(null, args);
      return rtn;
    };
    var getDynCaller = (sig, ptr) => {
      var argCache = [];
      return function() {
        argCache.length = 0;
        Object.assign(argCache, arguments);
        return dynCall(sig, ptr, argCache);
      };
    };
    function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
      function makeDynCaller() {
        if (signature.includes("j")) {
          return getDynCaller(signature, rawFunction);
        }
        return getWasmTableEntry(rawFunction);
      }
      var fp = makeDynCaller();
      if (typeof fp != "function") {
        throwBindingError(`unknown function pointer with signature ${signature}: ${rawFunction}`);
      }
      return fp;
    }
    function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
        this.name = errorName;
        this.message = message;
        var stack = new Error(message).stack;
        if (stack !== void 0) {
          this.stack = this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
        }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
        if (this.message === void 0) {
          return this.name;
        } else {
          return `${this.name}: ${this.message}`;
        }
      };
      return errorClass;
    }
    var UnboundTypeError = void 0;
    function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }
    function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
        if (seen[type]) {
          return;
        }
        if (registeredTypes[type]) {
          return;
        }
        if (typeDependencies[type]) {
          typeDependencies[type].forEach(visit);
          return;
        }
        unboundTypes.push(type);
        seen[type] = true;
      }
      types.forEach(visit);
      throw new UnboundTypeError(`${message}: ` + unboundTypes.map(getTypeName).join([", "]));
    }
    function __embind_register_class(rawType, rawPointerType, rawConstPointerType, baseClassRawType, getActualTypeSignature, getActualType, upcastSignature, upcast, downcastSignature, downcast, name, destructorSignature, rawDestructor) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
        upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
        downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
      exposePublicSymbol(legalFunctionName, function() {
        throwUnboundTypeError(`Cannot construct ${name} due to unbound types`, [baseClassRawType]);
      });
      whenDependentTypesAreResolved([rawType, rawPointerType, rawConstPointerType], baseClassRawType ? [baseClassRawType] : [], function(base) {
        base = base[0];
        var baseClass;
        var basePrototype;
        if (baseClassRawType) {
          baseClass = base.registeredClass;
          basePrototype = baseClass.instancePrototype;
        } else {
          basePrototype = ClassHandle.prototype;
        }
        var constructor = createNamedFunction(legalFunctionName, function() {
          if (Object.getPrototypeOf(this) !== instancePrototype) {
            throw new BindingError("Use 'new' to construct " + name);
          }
          if (void 0 === registeredClass.constructor_body) {
            throw new BindingError(name + " has no accessible constructor");
          }
          var body = registeredClass.constructor_body[arguments.length];
          if (void 0 === body) {
            throw new BindingError(`Tried to invoke ctor of ${name} with invalid number of parameters (${arguments.length}) - expected (${Object.keys(registeredClass.constructor_body).toString()}) parameters instead!`);
          }
          return body.apply(this, arguments);
        });
        var instancePrototype = Object.create(basePrototype, { constructor: { value: constructor } });
        constructor.prototype = instancePrototype;
        var registeredClass = new RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast);
        if (registeredClass.baseClass) {
          if (registeredClass.baseClass.__derivedClasses === void 0) {
            registeredClass.baseClass.__derivedClasses = [];
          }
          registeredClass.baseClass.__derivedClasses.push(registeredClass);
        }
        var referenceConverter = new RegisteredPointer(name, registeredClass, true, false, false);
        var pointerConverter = new RegisteredPointer(name + "*", registeredClass, false, false, false);
        var constPointerConverter = new RegisteredPointer(name + " const*", registeredClass, false, true, false);
        registeredPointers[rawType] = { pointerType: pointerConverter, constPointerType: constPointerConverter };
        replacePublicSymbol(legalFunctionName, constructor);
        return [referenceConverter, pointerConverter, constPointerConverter];
      });
    }
    function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
        array.push(HEAPU32[firstElement + i * 4 >> 2]);
      }
      return array;
    }
    function runDestructors(destructors) {
      while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
      }
    }
    function newFunc(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
        throw new TypeError(`new_ called with constructor type ${typeof constructor} which is not a function`);
      }
      var dummy = createNamedFunction(constructor.name || "unknownFunctionName", function() {
      });
      dummy.prototype = constructor.prototype;
      var obj = new dummy();
      var r = constructor.apply(obj, argumentList);
      return r instanceof Object ? r : obj;
    }
    function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc, isAsync) {
      var argCount = argTypes.length;
      if (argCount < 2) {
        throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
      var isClassMethodFunc = argTypes[1] !== null && classType !== null;
      var needsDestructorStack = false;
      for (var i = 1; i < argTypes.length; ++i) {
        if (argTypes[i] !== null && argTypes[i].destructorFunction === void 0) {
          needsDestructorStack = true;
          break;
        }
      }
      var returns = argTypes[0].name !== "void";
      var argsList = "";
      var argsListWired = "";
      for (var i = 0; i < argCount - 2; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        argsListWired += (i !== 0 ? ", " : "") + "arg" + i + "Wired";
      }
      var invokerFnBody = `
        return function ${makeLegalFunctionName(humanName)}(${argsList}) {
        if (arguments.length !== ${argCount - 2}) {
          throwBindingError('function ${humanName} called with ${arguments.length} arguments, expected ${argCount - 2} args!');
        }`;
      if (needsDestructorStack) {
        invokerFnBody += "var destructors = [];\n";
      }
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
      if (isClassMethodFunc) {
        invokerFnBody += "var thisWired = classParam.toWireType(" + dtorStack + ", this);\n";
      }
      for (var i = 0; i < argCount - 2; ++i) {
        invokerFnBody += "var arg" + i + "Wired = argType" + i + ".toWireType(" + dtorStack + ", arg" + i + "); // " + argTypes[i + 2].name + "\n";
        args1.push("argType" + i);
        args2.push(argTypes[i + 2]);
      }
      if (isClassMethodFunc) {
        argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
      invokerFnBody += (returns || isAsync ? "var rv = " : "") + "invoker(fn" + (argsListWired.length > 0 ? ", " : "") + argsListWired + ");\n";
      if (needsDestructorStack) {
        invokerFnBody += "runDestructors(destructors);\n";
      } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
          if (argTypes[i].destructorFunction !== null) {
            invokerFnBody += paramName + "_dtor(" + paramName + "); // " + argTypes[i].name + "\n";
            args1.push(paramName + "_dtor");
            args2.push(argTypes[i].destructorFunction);
          }
        }
      }
      if (returns) {
        invokerFnBody += "var ret = retType.fromWireType(rv);\nreturn ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
      args1.push(invokerFnBody);
      return newFunc(Function, args1).apply(null, args2);
    }
    function __embind_register_class_constructor(rawClassType, argCount, rawArgTypesAddr, invokerSignature, invoker, rawConstructor) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
        classType = classType[0];
        var humanName = `constructor ${classType.name}`;
        if (void 0 === classType.registeredClass.constructor_body) {
          classType.registeredClass.constructor_body = [];
        }
        if (void 0 !== classType.registeredClass.constructor_body[argCount - 1]) {
          throw new BindingError(`Cannot register multiple constructors with identical number of parameters (${argCount - 1}) for class '${classType.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
        }
        classType.registeredClass.constructor_body[argCount - 1] = () => {
          throwUnboundTypeError(`Cannot construct ${classType.name} due to unbound types`, rawArgTypes);
        };
        whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
          argTypes.splice(1, 0, null);
          classType.registeredClass.constructor_body[argCount - 1] = craftInvokerFunction(humanName, argTypes, null, invoker, rawConstructor);
          return [];
        });
        return [];
      });
    }
    function __embind_register_class_function(rawClassType, methodName, argCount, rawArgTypesAddr, invokerSignature, rawInvoker, context, isPureVirtual, isAsync) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
        classType = classType[0];
        var humanName = `${classType.name}.${methodName}`;
        if (methodName.startsWith("@@")) {
          methodName = Symbol[methodName.substring(2)];
        }
        if (isPureVirtual) {
          classType.registeredClass.pureVirtualFunctions.push(methodName);
        }
        function unboundTypesHandler() {
          throwUnboundTypeError(`Cannot call ${humanName} due to unbound types`, rawArgTypes);
        }
        var proto = classType.registeredClass.instancePrototype;
        var method = proto[methodName];
        if (void 0 === method || void 0 === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2) {
          unboundTypesHandler.argCount = argCount - 2;
          unboundTypesHandler.className = classType.name;
          proto[methodName] = unboundTypesHandler;
        } else {
          ensureOverloadTable(proto, methodName, humanName);
          proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
          var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context, isAsync);
          if (void 0 === proto[methodName].overloadTable) {
            memberFunction.argCount = argCount - 2;
            proto[methodName] = memberFunction;
          } else {
            proto[methodName].overloadTable[argCount - 2] = memberFunction;
          }
          return [];
        });
        return [];
      });
    }
    function handleAllocatorInit() {
      Object.assign(HandleAllocator.prototype, { get(id) {
        return this.allocated[id];
      }, has(id) {
        return this.allocated[id] !== void 0;
      }, allocate(handle) {
        var id = this.freelist.pop() || this.allocated.length;
        this.allocated[id] = handle;
        return id;
      }, free(id) {
        this.allocated[id] = void 0;
        this.freelist.push(id);
      } });
    }
    function HandleAllocator() {
      this.allocated = [void 0];
      this.freelist = [];
    }
    var emval_handles = new HandleAllocator();
    function __emval_decref(handle) {
      if (handle >= emval_handles.reserved && 0 === --emval_handles.get(handle).refcount) {
        emval_handles.free(handle);
      }
    }
    function count_emval_handles() {
      var count = 0;
      for (var i = emval_handles.reserved; i < emval_handles.allocated.length; ++i) {
        if (emval_handles.allocated[i] !== void 0) {
          ++count;
        }
      }
      return count;
    }
    function init_emval() {
      emval_handles.allocated.push({ value: void 0 }, { value: null }, { value: true }, { value: false });
      emval_handles.reserved = emval_handles.allocated.length;
      Module2["count_emval_handles"] = count_emval_handles;
    }
    var Emval = { toValue: (handle) => {
      if (!handle) {
        throwBindingError("Cannot use deleted val. handle = " + handle);
      }
      return emval_handles.get(handle).value;
    }, toHandle: (value) => {
      switch (value) {
        case void 0:
          return 1;
        case null:
          return 2;
        case true:
          return 3;
        case false:
          return 4;
        default: {
          return emval_handles.allocate({ refcount: 1, value });
        }
      }
    } };
    function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, { name, "fromWireType": function(handle) {
        var rv = Emval.toValue(handle);
        __emval_decref(handle);
        return rv;
      }, "toWireType": function(destructors, value) {
        return Emval.toHandle(value);
      }, "argPackAdvance": 8, "readValueFromPointer": simpleReadValueFromPointer, destructorFunction: null });
    }
    function embindRepr(v) {
      if (v === null) {
        return "null";
      }
      var t = typeof v;
      if (t === "object" || t === "array" || t === "function") {
        return v.toString();
      } else {
        return "" + v;
      }
    }
    function floatReadValueFromPointer(name, shift) {
      switch (shift) {
        case 2:
          return function(pointer) {
            return this["fromWireType"](HEAPF32[pointer >> 2]);
          };
        case 3:
          return function(pointer) {
            return this["fromWireType"](HEAPF64[pointer >> 3]);
          };
        default:
          throw new TypeError("Unknown float type: " + name);
      }
    }
    function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, { name, "fromWireType": function(value) {
        return value;
      }, "toWireType": function(destructors, value) {
        return value;
      }, "argPackAdvance": 8, "readValueFromPointer": floatReadValueFromPointer(name, shift), destructorFunction: null });
    }
    function integerReadValueFromPointer(name, shift, signed) {
      switch (shift) {
        case 0:
          return signed ? function readS8FromPointer(pointer) {
            return HEAP8[pointer];
          } : function readU8FromPointer(pointer) {
            return HEAPU8[pointer];
          };
        case 1:
          return signed ? function readS16FromPointer(pointer) {
            return HEAP16[pointer >> 1];
          } : function readU16FromPointer(pointer) {
            return HEAPU16[pointer >> 1];
          };
        case 2:
          return signed ? function readS32FromPointer(pointer) {
            return HEAP32[pointer >> 2];
          } : function readU32FromPointer(pointer) {
            return HEAPU32[pointer >> 2];
          };
        default:
          throw new TypeError("Unknown integer type: " + name);
      }
    }
    function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) {
        maxRange = 4294967295;
      }
      var shift = getShiftFromSize(size);
      var fromWireType = (value) => value;
      if (minRange === 0) {
        var bitshift = 32 - 8 * size;
        fromWireType = (value) => value << bitshift >>> bitshift;
      }
      var isUnsignedType = name.includes("unsigned");
      var checkAssertions = (value, toTypeName) => {
      };
      var toWireType;
      if (isUnsignedType) {
        toWireType = function(destructors, value) {
          checkAssertions(value, this.name);
          return value >>> 0;
        };
      } else {
        toWireType = function(destructors, value) {
          checkAssertions(value, this.name);
          return value;
        };
      }
      registerType(primitiveType, { name, "fromWireType": fromWireType, "toWireType": toWireType, "argPackAdvance": 8, "readValueFromPointer": integerReadValueFromPointer(name, shift, minRange !== 0), destructorFunction: null });
    }
    function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
      var TA = typeMapping[dataTypeIndex];
      function decodeMemoryView(handle) {
        handle = handle >> 2;
        var heap = HEAPU32;
        var size = heap[handle];
        var data = heap[handle + 1];
        return new TA(heap.buffer, data, size);
      }
      name = readLatin1String(name);
      registerType(rawType, { name, "fromWireType": decodeMemoryView, "argPackAdvance": 8, "readValueFromPointer": decodeMemoryView }, { ignoreDuplicateRegistrations: true });
    }
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = 65536 + ((u & 1023) << 10) | u1 & 1023;
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : void 0;
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode((u0 & 31) << 6 | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = (u0 & 15) << 12 | u1 << 6 | u2;
        } else {
          u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        }
      }
      return str;
    };
    var UTF8ToString = (ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
    function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      var stdStringIsUTF8 = name === "std::string";
      registerType(rawType, { name, "fromWireType": function(value) {
        var length = HEAPU32[value >> 2];
        var payload = value + 4;
        var str;
        if (stdStringIsUTF8) {
          var decodeStartPtr = payload;
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = payload + i;
            if (i == length || HEAPU8[currentBytePtr] == 0) {
              var maxRead = currentBytePtr - decodeStartPtr;
              var stringSegment = UTF8ToString(decodeStartPtr, maxRead);
              if (str === void 0) {
                str = stringSegment;
              } else {
                str += String.fromCharCode(0);
                str += stringSegment;
              }
              decodeStartPtr = currentBytePtr + 1;
            }
          }
        } else {
          var a = new Array(length);
          for (var i = 0; i < length; ++i) {
            a[i] = String.fromCharCode(HEAPU8[payload + i]);
          }
          str = a.join("");
        }
        _free(value);
        return str;
      }, "toWireType": function(destructors, value) {
        if (value instanceof ArrayBuffer) {
          value = new Uint8Array(value);
        }
        var length;
        var valueIsOfTypeString = typeof value == "string";
        if (!(valueIsOfTypeString || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array)) {
          throwBindingError("Cannot pass non-string to std::string");
        }
        if (stdStringIsUTF8 && valueIsOfTypeString) {
          length = lengthBytesUTF8(value);
        } else {
          length = value.length;
        }
        var base = _malloc(4 + length + 1);
        var ptr = base + 4;
        HEAPU32[base >> 2] = length;
        if (stdStringIsUTF8 && valueIsOfTypeString) {
          stringToUTF8(value, ptr, length + 1);
        } else {
          if (valueIsOfTypeString) {
            for (var i = 0; i < length; ++i) {
              var charCode = value.charCodeAt(i);
              if (charCode > 255) {
                _free(ptr);
                throwBindingError("String has UTF-16 code units that do not fit in 8 bits");
              }
              HEAPU8[ptr + i] = charCode;
            }
          } else {
            for (var i = 0; i < length; ++i) {
              HEAPU8[ptr + i] = value[i];
            }
          }
        }
        if (destructors !== null) {
          destructors.push(_free, base);
        }
        return base;
      }, "argPackAdvance": 8, "readValueFromPointer": simpleReadValueFromPointer, destructorFunction: function(ptr) {
        _free(ptr);
      } });
    }
    var UTF16Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf-16le") : void 0;
    var UTF16ToString = (ptr, maxBytesToRead) => {
      var endPtr = ptr;
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
      endPtr = idx << 1;
      if (endPtr - ptr > 32 && UTF16Decoder) return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
      var str = "";
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[ptr + i * 2 >> 1];
        if (codeUnit == 0) break;
        str += String.fromCharCode(codeUnit);
      }
      return str;
    };
    var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      if (maxBytesToWrite === void 0) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
      }
      HEAP16[outPtr >> 1] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF16 = (str) => str.length * 2;
    var UTF32ToString = (ptr, maxBytesToRead) => {
      var i = 0;
      var str = "";
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = HEAP32[ptr + i * 4 >> 2];
        if (utf32 == 0) break;
        ++i;
        if (utf32 >= 65536) {
          var ch = utf32 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        } else {
          str += String.fromCharCode(utf32);
        }
      }
      return str;
    };
    var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
      if (maxBytesToWrite === void 0) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 4) return 0;
      var startPtr = outPtr;
      var endPtr = startPtr + maxBytesToWrite - 4;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) {
          var trailSurrogate = str.charCodeAt(++i);
          codeUnit = 65536 + ((codeUnit & 1023) << 10) | trailSurrogate & 1023;
        }
        HEAP32[outPtr >> 2] = codeUnit;
        outPtr += 4;
        if (outPtr + 4 > endPtr) break;
      }
      HEAP32[outPtr >> 2] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF32 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
        len += 4;
      }
      return len;
    };
    var __embind_register_std_wstring = function(rawType, charSize, name) {
      name = readLatin1String(name);
      var decodeString, encodeString, getHeap, lengthBytesUTF, shift;
      if (charSize === 2) {
        decodeString = UTF16ToString;
        encodeString = stringToUTF16;
        lengthBytesUTF = lengthBytesUTF16;
        getHeap = () => HEAPU16;
        shift = 1;
      } else if (charSize === 4) {
        decodeString = UTF32ToString;
        encodeString = stringToUTF32;
        lengthBytesUTF = lengthBytesUTF32;
        getHeap = () => HEAPU32;
        shift = 2;
      }
      registerType(rawType, { name, "fromWireType": function(value) {
        var length = HEAPU32[value >> 2];
        var HEAP = getHeap();
        var str;
        var decodeStartPtr = value + 4;
        for (var i = 0; i <= length; ++i) {
          var currentBytePtr = value + 4 + i * charSize;
          if (i == length || HEAP[currentBytePtr >> shift] == 0) {
            var maxReadBytes = currentBytePtr - decodeStartPtr;
            var stringSegment = decodeString(decodeStartPtr, maxReadBytes);
            if (str === void 0) {
              str = stringSegment;
            } else {
              str += String.fromCharCode(0);
              str += stringSegment;
            }
            decodeStartPtr = currentBytePtr + charSize;
          }
        }
        _free(value);
        return str;
      }, "toWireType": function(destructors, value) {
        if (!(typeof value == "string")) {
          throwBindingError(`Cannot pass non-string to C++ string type ${name}`);
        }
        var length = lengthBytesUTF(value);
        var ptr = _malloc(4 + length + charSize);
        HEAPU32[ptr >> 2] = length >> shift;
        encodeString(value, ptr + 4, length + charSize);
        if (destructors !== null) {
          destructors.push(_free, ptr);
        }
        return ptr;
      }, "argPackAdvance": 8, "readValueFromPointer": simpleReadValueFromPointer, destructorFunction: function(ptr) {
        _free(ptr);
      } });
    };
    function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, { isVoid: true, name, "argPackAdvance": 0, "fromWireType": function() {
        return void 0;
      }, "toWireType": function(destructors, o) {
        return void 0;
      } });
    }
    var emval_symbols = {};
    function getStringOrSymbol(address) {
      var symbol = emval_symbols[address];
      if (symbol === void 0) {
        return readLatin1String(address);
      }
      return symbol;
    }
    var emval_methodCallers = [];
    function __emval_call_void_method(caller, handle, methodName, args) {
      caller = emval_methodCallers[caller];
      handle = Emval.toValue(handle);
      methodName = getStringOrSymbol(methodName);
      caller(handle, methodName, null, args);
    }
    function emval_addMethodCaller(caller) {
      var id = emval_methodCallers.length;
      emval_methodCallers.push(caller);
      return id;
    }
    function requireRegisteredType(rawType, humanName) {
      var impl = registeredTypes[rawType];
      if (void 0 === impl) {
        throwBindingError(humanName + " has unknown type " + getTypeName(rawType));
      }
      return impl;
    }
    function emval_lookupTypes(argCount, argTypes) {
      var a = new Array(argCount);
      for (var i = 0; i < argCount; ++i) {
        a[i] = requireRegisteredType(HEAPU32[argTypes + i * 4 >> 2], "parameter " + i);
      }
      return a;
    }
    var emval_registeredMethods = [];
    function __emval_get_method_caller(argCount, argTypes) {
      var types = emval_lookupTypes(argCount, argTypes);
      var retType = types[0];
      var signatureName = retType.name + "_$" + types.slice(1).map(function(t) {
        return t.name;
      }).join("_") + "$";
      var returnId = emval_registeredMethods[signatureName];
      if (returnId !== void 0) {
        return returnId;
      }
      var params = ["retType"];
      var args = [retType];
      var argsList = "";
      for (var i = 0; i < argCount - 1; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        params.push("argType" + i);
        args.push(types[1 + i]);
      }
      var functionName = makeLegalFunctionName("methodCaller_" + signatureName);
      var functionBody = "return function " + functionName + "(handle, name, destructors, args) {\n";
      var offset = 0;
      for (var i = 0; i < argCount - 1; ++i) {
        functionBody += "    var arg" + i + " = argType" + i + ".readValueFromPointer(args" + (offset ? "+" + offset : "") + ");\n";
        offset += types[i + 1]["argPackAdvance"];
      }
      functionBody += "    var rv = handle[name](" + argsList + ");\n";
      for (var i = 0; i < argCount - 1; ++i) {
        if (types[i + 1]["deleteObject"]) {
          functionBody += "    argType" + i + ".deleteObject(arg" + i + ");\n";
        }
      }
      if (!retType.isVoid) {
        functionBody += "    return retType.toWireType(destructors, rv);\n";
      }
      functionBody += "};\n";
      params.push(functionBody);
      var invokerFunction = newFunc(Function, params).apply(null, args);
      returnId = emval_addMethodCaller(invokerFunction);
      emval_registeredMethods[signatureName] = returnId;
      return returnId;
    }
    var _abort = () => {
      abort("");
    };
    var _emscripten_get_now;
    _emscripten_get_now = () => performance.now();
    var _emscripten_memcpy_big = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
    var abortOnCannotGrowMemory = (requestedSize) => {
      abort("OOM");
    };
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      abortOnCannotGrowMemory(requestedSize);
    };
    var printCharBuffers = [null, [], []];
    var printChar = (stream, curr) => {
      var buffer = printCharBuffers[stream];
      if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
        buffer.length = 0;
      } else {
        buffer.push(curr);
      }
    };
    var SYSCALLS = { varargs: void 0, get() {
      SYSCALLS.varargs += 4;
      var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
      return ret;
    }, getStr(ptr) {
      var ret = UTF8ToString(ptr);
      return ret;
    } };
    var _fd_write = (fd, iov, iovcnt, pnum) => {
      var num = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        for (var j = 0; j < len; j++) {
          printChar(fd, HEAPU8[ptr + j]);
        }
        num += len;
      }
      HEAPU32[pnum >> 2] = num;
      return 0;
    };
    embind_init_charCodes();
    BindingError = Module2["BindingError"] = class BindingError extends Error {
      constructor(message) {
        super(message);
        this.name = "BindingError";
      }
    };
    InternalError = Module2["InternalError"] = class InternalError extends Error {
      constructor(message) {
        super(message);
        this.name = "InternalError";
      }
    };
    init_ClassHandle();
    init_embind();
    init_RegisteredPointer();
    UnboundTypeError = Module2["UnboundTypeError"] = extendError(Error, "UnboundTypeError");
    handleAllocatorInit();
    init_emval();
    var wasmImports = { o: ___cxa_throw, r: __embind_register_bigint, m: __embind_register_bool, q: __embind_register_class, p: __embind_register_class_constructor, d: __embind_register_class_function, u: __embind_register_emval, k: __embind_register_float, b: __embind_register_integer, a: __embind_register_memory_view, j: __embind_register_std_string, g: __embind_register_std_wstring, n: __embind_register_void, e: __emval_call_void_method, l: __emval_decref, h: __emval_get_method_caller, f: _abort, c: _emscripten_get_now, t: _emscripten_memcpy_big, s: _emscripten_resize_heap, i: _fd_write };
    var asm = createWasm();
    var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["w"])();
    var _free = (a0) => (_free = wasmExports["x"])(a0);
    var _malloc = (a0) => (_malloc = wasmExports["y"])(a0);
    var ___getTypeName = (a0) => (___getTypeName = wasmExports["A"])(a0);
    var __embind_initialize_bindings = Module2["__embind_initialize_bindings"] = () => (__embind_initialize_bindings = Module2["__embind_initialize_bindings"] = wasmExports["B"])();
    var ___errno_location = () => (___errno_location = wasmExports["__errno_location"])();
    var ___cxa_is_pointer_type = (a0) => (___cxa_is_pointer_type = wasmExports["C"])(a0);
    var dynCall_jiji = Module2["dynCall_jiji"] = (a0, a1, a2, a3, a4) => (dynCall_jiji = Module2["dynCall_jiji"] = wasmExports["D"])(a0, a1, a2, a3, a4);
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function run() {
      if (runDependencies > 0) {
        return;
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module2["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        readyPromiseResolve(Module2);
        if (Module2["onRuntimeInitialized"]) Module2["onRuntimeInitialized"]();
        postRun();
      }
      if (Module2["setStatus"]) {
        Module2["setStatus"]("Running...");
        setTimeout(function() {
          setTimeout(function() {
            Module2["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    if (Module2["preInit"]) {
      if (typeof Module2["preInit"] == "function") Module2["preInit"] = [Module2["preInit"]];
      while (Module2["preInit"].length > 0) {
        Module2["preInit"].pop()();
      }
    }
    run();
    return moduleArg.ready;
  });
})();
var videodec_simd_default = Module;

// node_modules/jv4-decoder/src/video_decoder_soft_simd.ts
var VideoDecoderSoftSIMD = class extends VideoDecoderSoftBase {
  constructor(opt) {
    super(videodec_simd_default, opt?.wasmPath ? fetch(opt.wasmPath).then((res) => res.arrayBuffer()) : void 0, opt?.workerMode, opt?.canvas, opt?.yuvMode);
  }
};

// node_modules/jv4-decoder/src/video_decoder_hard.ts
var VideoDecoderHard = class extends FSM {
  async initialize() {
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.emit("videoFrame" /* VideoFrame */, frame);
      },
      error: (err) => {
        this.close();
        this.emit("error" /* Error */, err);
      }
    });
  }
  configure(config) {
    this.config = config;
    if (!config.description && config.codec !== "av1") {
      this.config[config.codec] = {
        format: "annexb"
      };
    }
    this.decoder.configure({
      ...config,
      codec: this.getCodec(config)
    });
  }
  getCodec(config) {
    switch (config.codec) {
      case "hevc":
        return "hvc1.1.6.L0.12.34.56.78.9A.BC";
      case "av1":
        return "av01.0.05M.08";
      case "avc":
        return "avc1.420028";
      default:
        return config.codec;
    }
  }
  decode(packet) {
    if (this.decoder.state === "configured")
      this.decoder.decode(new EncodedVideoChunk(packet));
  }
  flush() {
    this.decoder.flush();
  }
  reset() {
    this.decoder.reset();
  }
  close() {
    if (this.decoder.state !== "closed")
      this.decoder.close();
  }
};
__decorateClass([
  ChangeState([FSM.INIT, "closed"], "initialized")
], VideoDecoderHard.prototype, "initialize", 1);
__decorateClass([
  ChangeState("initialized", "configured", { sync: true })
], VideoDecoderHard.prototype, "configure", 1);
__decorateClass([
  Includes("configured")
], VideoDecoderHard.prototype, "decode", 1);
__decorateClass([
  ChangeState([], FSM.INIT, { sync: true })
], VideoDecoderHard.prototype, "reset", 1);
__decorateClass([
  ChangeState([], "closed", { ignoreError: true, sync: true })
], VideoDecoderHard.prototype, "close", 1);
export {
  DemuxEvent,
  DemuxMode,
  FlvDemuxer,
  HttpConnection,
  VideoDecoderEvent,
  VideoDecoderHard,
  VideoDecoderSoftSIMD
};
