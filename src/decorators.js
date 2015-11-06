
//construct class without 'new' keyword
//bind methods to object
export function bound (...args) {
  const firstArgType = typeof args[0]
  //for class
  if (firstArgType === 'function') {
    const [target] = args
    return (...classArgs) => {
      const result = new target(...classArgs)
      Object.keys(target.prototype).forEach(name => {
        const method = target.prototype[name]
        if (typeof method === 'function' && method.isBoundMethod) {
          result[name] = method.bind(result)
        }
      })
      return result
    }
  }

  //for class with string arguments
  //ex)
  //@bound('methodName1', 'methodName2')
  //class myClass {}
  if (firstArgType === 'string') {
    return target => (...classArgs) => {
      const result = bound(target)(classArgs)
      args.forEach(name => {
        const method = result[name]
        if (typeof method === 'function') {
          result[name] = method.bind(result)
        }
      })
      return result
    }
  }

  //for method
  if (firstArgType === 'object') {
    const [target, name, descriptor] = args
    descriptor.value.isBoundMethod = true
    return descriptor
  }
}

const DELEGATE = Symbol('delegate')

//call method only if possible
//to use it, class must implements '_isRunnable' method
//to check this instance is runnable
//if not runnable, method calls are stored
//to execute stored calls, delegate.run(this)
//NOTE: @delegate promisify method
//      so .then() is needed to retrieve original return value
//      if your method already return Promise, just ignore it
export function delegate (...args) {
  const firstArgType = typeof args[0]
  //if name of '_isRunnable' is specified
  if (firstArgType === 'string') {
    const [isRunnableName] = args
    return getDecorator(isRunnableName)
  }

  if (firstArgType === 'object') {
    return getDecorator('_isRunnable')(...args)
  }

  function getDecorator (isRunnableName) {
    return (target, name, descriptor) => {
      const method = descriptor.value
      descriptor.value = function (...methodArgs) {
        const runnable = this[isRunnableName]()
        if (runnable) {
          return Promise.resolve(method(...methodArgs))
        }
        return new Promise(resolve => {
          const delegates = this[DELEGATE] = this[DELEGATE] || []
          delegates.push([resolve, method, ...methodArgs])
        })
      }
    }
  }
}

delegate.run = instance => {
  instance[DELEGATE] &&
  instance[DELEGATE].forEach(([resolve, method, ...args]) => {
    resolve(method.apply(instance, args))
  })
}
