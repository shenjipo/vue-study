# vue2

## 响应式简介

vue框架提供了数据的响应式能力，所谓的响应式就是当我们修改了内存的某个数据之后，vue能够自动根据某种映射关系，把这个数据的变化更新到真实的dom节点上。从直觉上来说，要实现这个功能，需要能够监听数据的变化，在数据变化时，执行一段函数就可以了，这是最基本的原理。要真正的实现这种监听还需要两个能力

* **依赖收集**，一个页面上有多种数据，一个数据也可能以不同的方式展示，在页面渲染之后，框架需要能够自动生成数据与函数的依赖关系，例如数据A在页面上被两个地方以两种业务逻辑展示fun1A和fun2A，那么在页面渲染完成后，框架能够知道fun1A函数依赖数据A，fun2A函数也依赖数据A，数据A影响了fun1A和fun2A的执行结果。
* **派发更新**，这个比较好理解，就是当A数据发生了变化之后，框架能够自动的重新执行fun1A和fun2A

所以，要实现数据的响应式能力由这三种能力组成

1. 数据变化的监听
2. 依赖收集
3. 派发更新

vue2使用了Object.definePropertyapi来实现数据的监听，使用了观察者模式来实现依赖收集与派发更新。Object.defineProperty这个api已经被很多博客介绍过了，理解起来比较容易，本文不做介绍。而如何使用观察者模式来实现自动依赖收集与派发更新是vue的一个核心技术点，很多文章讲的比较模糊，而且没有提供简化的能够上手调试的demo，因此本文重点介绍vue如何使用观察者模式实现自动依赖收集与派发更新

### 观察者模式

在设计模式还有一种设计模式叫发布-订阅模式，这种模式和观察者模式有一定的相似之处，对比学习能够更好的理解观察者模式的作用与使用的场景。
![image.png](http://101.133.143.249:3000/api/getImage/image_593f891a-d507-41d5-bef4-e73682919717.png)
如上图所示，发布订阅模式相比观察者模式多了一个Topic Event（事件注册中心），Publisher和subscriber的关联关系需要通过Topic Event来间接进行，publisher和subscriber属于弱耦合状态，publisher不知道自己发布的主题被哪些subscriber订阅，而subscriber也不知道自己订阅的topic是被谁发布的。在观察者模式中，Watcher和dep是强耦合关系，观察者知道自己所有观察的对象，被观察者也知道自己被哪些Watcher观察了。
vue选择了观察者模式原因是为了性能优化，能够细粒度的更新视图，例如

```javascript
new Vue({
    data: {
        nameList: ['wang'],
        age: 22,
    }
})
```

某个render watcher依赖了age(后面会介绍什么是render watcher)，vue希望只有age发生变化时去通知render watcher更新，而namelist变化时不去更新。因此能够相互直接影响的观察者模式更适合用户处理这种关系。发布订阅其实也可以，但是由于publish和subscriber总是通过Topic Event来间接影响做起来更麻烦。

### 依赖收集

依赖收集的过程如下图所示
![image.png](http://101.133.143.249:3000/api/getImage/image_6e413c9f-c534-4329-9f4b-368abf9ce9df.png)

1. Observe(data)，使用Object.defineproperty api重写用户定义数据的get和set方法，在get方法中收集watcher依赖，在set方法中触发watcher更新
2. 初始化一个watcherA，在watcher内部有一个对象deps保存了这个watcher所有依赖的数据
3. 计算watcher的value，这一步`render watcher` `computed watcher` `watch wathcer`的具体实现有所区别，但是所有watcher在计算value的第一步都是先执行pushTarget
4. pushTarget，这一步把第2步生成的watcher实例插入watcher栈，并且挂载到一个全局对象Dep.target上，方便这个watcher依赖的数据收集
5. 依赖收集，在计算三种watcher值的过程中，会触发所依赖的数据被重写的get方法，在get方法中收集watcherA
6. 收集依赖结束，把watcherA出栈，并且把全局的Dep.target置为null
   最终可以看到在watcherA内部的deps数组保存了objA.__ob__，在objA.__ob__的subs数组里保存了watcherA，这样观察者和被观察者都能直接影响对方，方便依赖的更新与派发

### 派发更新

派发更新的过程如下图所示
![image.png](http://101.133.143.249:3000/api/getImage/image_64109d98-cd41-4711-be6d-b39689243d16.png)
假设有三个render Watcher,watcher1依赖了objA，watcher2依赖了objA和objB，watcher3依赖了objB，在完成了依赖收集后，被观察的数据objA和objB知道哪些watcher在观察自己，当数据objA发生了变化时，触发了重写的set方法，通知对应的watcher重新计算value

## 3种watcher介绍

vue总共有三种类型的watcher，

* render watcher 渲染watcher，主要用来计算页面上{{}}内部的值
* computed watcher 计算属性 watcher，主要用于用户定义的computed
* watch watcher 数据监听 watcher，主要用户用户定义的watch
  这三种watcher的响应式原理总体上一样，都是基于观察者模式+数据监听，但是在具体功能上有所区别，其中render watcher是最基础的watcher，computed watcher为了实现`当数据没有发生变化时，不重新计算而是用缓存`而实现了一套懒更新，watch watcher在初始化时传入的expOrFn不是一个函数而是一个字符串，需要利用parsePath把这个字符串转换成一段函数，在计算value时候执行，保证能够触发watcher的对象收集依赖，此外，在更新value时候，需要同时项cb函数传入newValue和oldvalue。
  最后vue在被观察者的层面屏蔽了三种watcher的差异，提供了统一的update方法来更新watcher。

## 三种watcher的仿vue手写实现

vue实现响应式的细节很多，而且考虑了很多场景，下面是部分功能的手写实现

1. [render watcher基础响应式手写实现](https://github.com/shenjipo/vue-study/blob/master/1.reactive(1.base).html)
2. [render watcher新增监听键值对新增的响应式实现](https://github.com/shenjipo/vue-study/blob/master/1.reactive(2.%E5%AF%B9%E8%B1%A1%E9%94%AE%E6%96%B0%E5%A2%9E%E5%88%A0%E9%99%A4key%E7%9A%84%E5%93%8D%E5%BA%94%E5%BC%8F).html)
3. [render watcher数组7种方法的响应式实现](https://github.com/shenjipo/vue-study/blob/master/1.reactive(3.%E6%95%B0%E7%BB%84reactive).html)
4. [computed watcher基础响应式实现](https://github.com/shenjipo/vue-study/blob/master/3.computed(1.base).html)
5. [computed watcher更新依赖实现](https://github.com/shenjipo/vue-study/blob/master/3.computed(2.%E6%A0%B9%E6%8D%AE%E6%95%B0%E6%8D%AE%E5%8F%98%E5%8C%96%E6%9B%B4%E6%96%B0%E4%BE%9D%E8%B5%96).html)
6. [computed watcher依赖了computed watcher实现](https://github.com/shenjipo/vue-study/blob/master/3.computed(3.%E4%BE%9D%E8%B5%96%E4%BA%86%E8%AE%A1%E7%AE%97%E5%B1%9E%E6%80%A7%E7%9A%84%E8%AE%A1%E7%AE%97%E5%B1%9E%E6%80%A7).html)
7. [watch watcher基础响应式实现](https://github.com/shenjipo/vue-study/blob/master/4.Watch(1.base).html)

## vue2无法实现响应式的若干情况


## vue2部分源码设计原因

### vue内部为什么有两种Dep实例，一种是闭包，一种是对象上的__ob__?

为了实现对象属性添加与删除的响应式

### 为什么vue不允许在组件内部的data对象上动态的添加响应式数据？

同上，因为vue没有实现对于对象新增、删除属性的监听，而且对于根data对象，没有生成对应的dep实例，

### 那么为什么非根data对象可以通过this.$set实现动态添加响应式的数据，怎么实现的？

利用了对象上的dep实例，即xx.__ob__
