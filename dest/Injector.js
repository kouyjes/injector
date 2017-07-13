(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (factory((global.HERE = global.HERE || {})));
}(this, (function (exports) { 'use strict';

function template(text){
    var args = Array.prototype.slice.call(arguments,1);
    return text.replace(/\{\s*(\d+)\s*\}/g, function (all,argIndex) {
        return args[argIndex] || '';
    });
}
function error(text){
    var text = template.apply(this,arguments);
    var e = new Error(text);
    throw e;
}
function isObject(value){
    return value !== null && typeof value === 'object';
}
var isArray = Array.isArray || function (array) {
        return array instanceof Array;
    };
function isString(value,throwError){
    var result = typeof value === 'string';
    if(!result && throwError){
        error('arg {0} must be string type !',value);
    }
    return result;
}
function isFunction(fn){
    return typeof fn === 'function';
}
function _nextId(){
    var _id = 1;
    return function () {
        return _id++;
    };
}
function nextInjectorNameFn(){
    var nextId = _nextId();
    return function () {
        return 'injector_' + nextId();
    }
}
function enforceFunction(fn){
    if(!isFunction(fn)){
        error('define must be a function !');
    }
    return fn;
}
function enforceReturnFunction(fn){
    if(isFunction(fn)){
        return fn;
    }
    return function () {
        return fn;
    };
}

/**
 * injector collection
 * @param injectors
 * @constructor
 */
function Super(injectors){
    this.injectors = injectors ? [].concat(injectors) : [];
}
Super.prototype.invokeMethod = function (methodName,params) {
    var val = null;
    this.injectors.some(function (injector) {
        val = injector[methodName].apply(injector,params);
        return !!val;
    });
    return val;
};

function Cache(parent) {
    this.super = parent ? [].concat(parent) : [];
    this.cache = {};
}
Cache.prototype.get = function (key) {
    var value = this.cache[key];
    if(value){
        return value;
    }
    this.super.some(function (cache) {
        value = cache.get(key);
        return !!value;
    });
    return value;
};
Cache.prototype.put = function (key,value) {
    this.cache[key] = value;
};
Cache.prototype.remove = function (key) {
    delete this.cache[key];
};
Cache.prototype.has = function (key) {
    return this.cache.hasOwnProperty(key);
};

/**
 * parser
 * parse function parameter
 * @type {RegExp}
 */
var ARROW_ARG = /^([^\(]+?)=>/;
var FN_ARGS = /^[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

function extractParameter(fn) {

    var fnText = fn.toString().replace(STRIP_COMMENTS, '');
    var args = fnText.match(ARROW_ARG) || fnText.match(FN_ARGS);
    var $injector = [];
    args[1].split(FN_ARG_SPLIT).forEach(function (arg) {
        arg.replace(FN_ARG, function (all, fix, name) {
            $injector.push(name);
        });
    });
    return $injector;
}

/**
 * Created by koujp on 2017/7/08.
 */
function enforceDefineFn(define){
    var $injector = [],defineFn = null;
    if(isArray(define)){
        defineFn = define.pop();
        enforceFunction(defineFn);
        $injector = define.slice();
    }else{
        defineFn = define;
        enforceFunction(defineFn);
        $injector = Injector.depInjector(defineFn) || extractParameter(define);
    }
    Injector.depInjector(defineFn,$injector);
    return defineFn;
}

function initDefineFnWithParams(name,define){
    var defineFn;
    if(!define){
        define = name;
        name = null;
    }
    defineFn = enforceDefineFn(define);
    var $injectorName = Injector.identify(defineFn) ? String(Injector.identify(defineFn)) : null;
    $injectorName = name || $injectorName || nextInjectorName();
    Injector.identify(defineFn,$injectorName);
    return defineFn;
}
function initGetParam(val){
    if(isFunction(val)){
        return Injector.identify(val);
    }
    if(isString(val)){
        return val;
    }
    error('arg : {0} is invalid !',val);
}
var nextInjectorName = nextInjectorNameFn();
function createInjector(){

    var providerCache = new Cache(),
        instanceCache = new Cache();

    var serviceIndex = Object.create(null),
        valueIndex = Object.create(null);

    function invokeFunction(method,context,params){
        var fn = context[method];
        return fn.apply(context,params);
    }
    function initiate(defineFn,getFn,fnInit){
        var _ = this;
        var args = (Injector.depInjector(defineFn) || []).map(function (dep) {
            var depValue = getFn.call(_,dep);
            if(!depValue){
                error('Dependence : {0} not found !',dep);
            }
            return depValue;
        });
        if(fnInit){
            return (Function.prototype.bind.apply(defineFn,[null].concat(args)))();
        }
        return new (Function.prototype.bind.apply(defineFn,[null].concat(args)))();

    }
    function providerNameSuffix(name){
        var providerSuffix = '_$Provider';
        return name + providerSuffix;
    }
    function getProvider(name){
        var providerName = providerNameSuffix(name);
        var provider = providerCache.get(providerName);
        return provider || null;
    }
    var initPath = [];
    function getFactory(name){
        name = initGetParam(name);
        var provider = this.getProvider(name);
        if(!provider){
            return null;
        }
        if(initPath.indexOf(name) >= 0){
            error('Circular dependence: {0} ' + initPath.join(' <-- '));
        }
        initPath.unshift(name);
        try{
            var factory = invokeFunction('$get',provider,undefined);
            return factory || null;
        }finally {
            initPath.shift();
        }
    }
    function getService(arg){
        var service;
        var name = initGetParam(arg);
        service = instanceCache.get(name);
        var isServiceDefine = serviceIndex[name];
        if(!existDefine(name) && !service){
            service = this.super.getService(name);
        }
        if(!service){
            service = this.getFactory(arg);
            isServiceDefine && instanceCache.put(name,service);
        }
        return service;
    }
    function getValue(name){
        return this.getFactory(name);
    }
    function existDefine(name){
        name = initGetParam(name);
        var providerName = providerNameSuffix(name);
        return providerCache.has(providerName);
    }
    function assertNotExist(name){
        name = initGetParam(name);
        if(existDefine(name)){
            error('injector name : {0} has defined !',name);
        }
    }
    function provider(name,provider){

        if(!isString(name)){
            error('provider arg {0} name must be a string type !',name);
        }
        !valueIndex[name] && assertNotExist(name);
        var providerName = providerNameSuffix(name);
        var providerFn = null;
        if(isFunction(provider) || isArray(provider)){
            providerFn = enforceDefineFn(provider);
        }else{
            providerFn = enforceReturnFunction(provider);
        }
        var _provider = initiate.call(this,providerFn,this['getProvider']);
        if(!isFunction(_provider['$get'])){
            error('Provider must define a $get function !');
        }
        providerCache.put(providerName,_provider);

        return this;

    }

    function factory(name,define){
        var _ = this;
        var factory = initDefineFnWithParams(name,define);
        return provider.call(this,Injector.identify(factory),{
            $get: function () {
                return initiate.call(_,factory,_['getFactory'],true);
            }
        });
    }
    function service(name,define){
        var _ = this;
        var service = initDefineFnWithParams(name,define);
        name = Injector.identify(service);
        var result = factory.call(this,name,function () {
            return initiate.call(_,service,_['getService']);
        });
        serviceIndex[name] = true;
        return result;
    }
    function value(name,val){
        isString(name,true);
        var result = factory.call(this,name,function () {
            return val;
        });
        valueIndex[name] = true;
        return result;
    }

    function invoke(define){
        var factory = initDefineFnWithParams(undefined,define);
        return initiate.call(this,factory,this['getFactory']);
    }

    return {
        invoke:invoke,
        provider:provider,
        value:value,
        service:service,
        factory:factory,
        getProvider:getProvider,
        getValue:getValue,
        getService:getService,
        getFactory:getFactory
    };

}

var slice = Array.prototype.slice;
var InjectorId = _nextId();
function Injector(){
    var _ = this;
    var _name = template('InjectorInstance_{0}',InjectorId());
    this.name = function (name) {
        if(arguments.length === 0){
            return _name;
        }
        _name = name;
        return this;
    };
    var injectors = [];
    slice.call(arguments,0).forEach(function (arg) {
        if(isArray(arg)){
            arg.forEach(function (ar) {
                if(ar instanceof Injector){
                    injectors.push(ar);
                }
            });
            return;
        }
        if(arg instanceof Injector){
            injectors.push(arg);
        }
    });
    this.super = new Super(injectors);
    var injectorExtend = createInjector(this);
    Object.assign(this,injectorExtend);

    ['getService','getFactory','getProvider'].forEach(function (methodName) {

        _.super[methodName] = function () {
            var params = slice.call(arguments,0);
            return this.invokeMethod(methodName,params);
        };
        _[methodName] = function () {
            var params = slice.call(arguments,0);
            var val = injectorExtend[methodName].apply(_,params);
            if(val){
                return val;
            }
            return _.super[methodName].apply(_.super,params);
        };
    });

    Injector.freezeConfig();
}
(function () {
    var _config = {
        injectorIdentifyKey:'$injectorName',
        injectorDepIdentifyKey:'$injector'
    };
    Injector.freezeConfig = function () {
        Injector.config = function (name) {
            if(arguments.length === 0){
                return {
                    injectorIdentifyKey:'$injectorName',
                    injectorDepIdentifyKey:'$injector'
                };
            }
            if(isString(name)){
                return _config[name];
            }
        };
    };
    Injector.config = function (name,val) {
        var config = {};
        if(arguments.length === 1){
            if(isString(name)){
                return _config[name];
            }else if(isObject(name)){
                config = name;
            }
        }else{
            if(!isString(name)){
                error('arg {0} is invalid !',name);
            }
            config[name] = val;
        }
        if(!val && isObject(name)){
            config = name;
        }
        if(!config){
            return;
        }
        Object.keys(config).forEach(function (key) {
            if(!_config.hasOwnProperty(key)){
                return;
            }
            var val = config[key];
            if(val && isString(val)){
                _config[key] = val;
            }
        });
    };
    Injector.identify = function (fn,value) {
        if(arguments.length === 1){
            return fn[_config.injectorIdentifyKey];
        }
        if(arguments.length === 2){
            fn[_config.injectorIdentifyKey] = value;
            return fn;
        }
    };
    Injector.depInjector = function (fn,injectors) {
        if(arguments.length === 1){
            return fn[_config.injectorDepIdentifyKey];
        }
        var $injectors = [];
        function appendInjector(injector){
            if(isArray(injector)){
                injector.forEach(appendInjector);
            }else if(isString(injector) || isFunction(injector)){
                $injectors.push(injector);
            }else{
                error('injector: {0} is invalid !' + injector);
            }
        }
        appendInjector(slice.call(arguments,1));
        fn[_config.injectorDepIdentifyKey] = $injectors;
    };

})();

exports.Injector = Injector;

Object.defineProperty(exports, '__esModule', { value: true });

})));
