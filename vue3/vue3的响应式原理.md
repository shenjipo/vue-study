## 源码

[本文源码-基于vue3.5](https://github.com/shenjipo/vue-study)

## 响应式原理

在[vue2的响应式原理](http://101.133.143.249/Blog/#/MainPage/BlogUpdate/8257bb7c-5f4e-4c12-a99e-60968208a262)中介绍了要实现数据的响应式，需要满足三个条件

* 数据变化的监听
* 依赖自动收集
* 派发更新

在vue3.5这个版本，除了对于基本数据类型的监听仍然使用`Object.defineProperty`实现，其它部分都做了重构，首先对于非基本数据类型的监听使用了`Proxy`与`Reflect`api实现，vue3.x的任意版本都是基于此，对于依赖的自动收集和派发更新，vue3.5引入了二维双向链表并结合观察者模式、发布订阅模式来实现

## 基本数据类型的响应式实现

由于`Proxy`只能实现对象类型数据的代理，所以对于基本数据类型的响应式，vue3使用了ES6的`class get set`来实现，其底层还是和vue2一样的`Object.defineProperty`，这一块有很多文章介绍过，本文不做介绍，重点讲一下vue3.5如何使用二维的双向链表这种数据结构来实现自动收集依赖与派发更新

### 响应式涉及的三个class

vue3.5的响应式涉及三个主要的class

* Dep
* Link
* ReactiveEffect

类比vue2的观察者模式，Dep是被观察的对象，ReactiveEffect是观察者，在vue3中被称为副作用函数（下面介绍时成为Sub），我们的目标是系统能够自动的建立起数据和相关副作用函数之间的联系，当数据发生变化时，通知相关的副作用函数去执行，然后更新依赖关系，Link就是用来连接Dep和Sub之间的桥梁，下图展示了Dep、Sub和Link之间的依赖关系，使用的链表结构实现

![a0da09f5e6317ccdfde1574ac3c3c0e4_b006f6f8369e59f3c03c9c72b92d2288.png](http://101.133.143.249/api/getImage/a0da09f5e6317ccdfde1574ac3c3c0e4_b006f6f8369e59f3c03c9c72b92d2288.png)

根据上图，vue3.5的响应式系统会把Sub节点放在x轴链表的头部，把Dep节点放在y轴链表的头部，其它位置都是Link节点，

Dep节点包含以下几个重要的属性

```javascript
class Dep{
        constructor() {
            // 用来控制更新链表
            this.version = 0;
            this.activeLink = void 0;
            // 指向link链表的尾部节点
            this.subs = void 0;
            // 指向link链表的头部节点
            this.subsHead = void 0;
        }
}
```

Link节点包含以下几个重要的属性

```javascript
class Link{
        constructor(sub, dep) {
            this.name = new Date().getTime()
            // watchEffect函数
            this.sub = sub;
            // 依赖的数据
            this.dep = dep;
            // 指向Link链表的后一个节点（X轴）nextLink
            this.nextDep = void 0
            // 指向Link链表的前一个节点（X轴）prevLink
            this.prevDep = void 0
            // 指向Link链表的下一个节点（Y轴）
            this.nextSub = void 0
            // 指向Link链表的上一个节点（Y轴）
            this.prevSub = void 0
            // 用于判断当前link和dep还是否保持响应式关系
            this.version = dep.version
        }
}
```

Sub节点包含以下几个重要的属性

```javascript
class ReactiveEffect{
        constructor(fn) {
            // 副作用函数
            this.fn = fn;
            // 指向链表的头部节点
            this.deps = void 0;
            // 指向链表的尾部节点
            this.depsTail = void 0;
        }
}
```

### 自动收集依赖、更新依赖的过程

下面以一个例子来说明这三个类之间是如何相互调用，实现自动收集依赖、更新依赖

假设有3个响应式变量和一个副作用函数

```javascript
const name1 = ref('a')
const name2 = ref('b')
const flag = ref(true)
const effect1 = new ReactiveEffect(() => {
    let temp = ''
    if (flag.value) {
        temp = name1.value
    } else {
        temp = name2.value
    }
})
effect1.run()
```

首先，当新建了ReactiveEffect的实例后，会调用run方法，自动执行传入的副作用函数，如果副作用函数内部有响应式变量，会触发该变量被劫持的get函数，在get函数内部，使用dep实例进行依赖收集

下面用几张图来说明二维双向链表的建立过程，可以结合[1.watchEffect(2.手写reactiveEffect基础数据类型，自动收集、更新依赖)](https://github.com/shenjipo/vue-study/blob/master/vue3/1.watchEffect(2.%E6%89%8B%E5%86%99reactiveEffect%E5%9F%BA%E7%A1%80%E6%95%B0%E6%8D%AE%E7%B1%BB%E5%9E%8B%EF%BC%8C%E8%87%AA%E5%8A%A8%E6%94%B6%E9%9B%86%E3%80%81%E6%9B%B4%E6%96%B0%E4%BE%9D%E8%B5%96).html))比较容易理解，

![image_86fddf2282bac8668fb0dfbfb30ee5a4.png](http://101.133.143.249/api/getImage/image_86fddf2282bac8668fb0dfbfb30ee5a4.png)

当执行了effect1.run之后，首先link的sub指向effect1，dep指向了依赖项dep(flag)

![image_d5ed4a4e10895db8eae4b3533e5a636f.png](http://101.133.143.249/api/getImage/image_d5ed4a4e10895db8eae4b3533e5a636f.png)

接着更新sub(effect1)的节点指向

![image_b1730534ad2f222f62eee4c0b66c0cf4.png](http://101.133.143.249/api/getImage/image_b1730534ad2f222f62eee4c0b66c0cf4.png)

接着更新dep(flag)的节点指向

![image_6b686c6c5a563148ac01f314a7b57918.png](http://101.133.143.249/api/getImage/image_6b686c6c5a563148ac01f314a7b57918.png)

副作用函数继续执行，触发了dep(a)收集依赖，各个节点指向的更新如上图所示

![image_b66efffa784bfa2682cf0f97fafd4fb6.png](http://101.133.143.249/api/getImage/image_b66efffa784bfa2682cf0f97fafd4fb6.png)

当我们执行了flag.value = false时，自动重新执行副作用函数，执行之前，先根据链表指向把sub所在y轴的所有link节点version设置为-1，执行过程中，回去更新对应link的version，当结束时，如果仍然有link的version为-1，那么这个link节点需要从链表移除

![image_ff160d9d76b757aa1fe81f13ad1d56c1.png](http://101.133.143.249/api/getImage/image_ff160d9d76b757aa1fe81f13ad1d56c1.png)

新加入了dep(b)依赖项，各个链表节点指向更新如图所示

![image_356686621eda822193ca5da0999319ba.png](http://101.133.143.249/api/getImage/image_356686621eda822193ca5da0999319ba.png)

最后，清楚version为-1的link节点，也就是中间一个，可以看到没有任何节点再指向此link

至此，完成了自动收集依赖与更新依赖

### 多个dep依赖多个sub时如何收集依赖、更新依赖

下面以一个例子来说明这三个类之间是如何相互调用，实现多个dep依赖多个sub时如何收集依赖、更新依赖

假设有2个响应式变量和2个副作用函数

```javascript
// 第二个参数用于调试，和响应式实现无关
const name1 = ref('wang', 'name1')
const name2 = ref('xing', 'name2')

const effect1 = new ReactiveEffect(() => {
    console.log('ReactiveEffect1')
    const res = name1.value + name2.value + '1'
}, 'effect1')
const effect2 = new ReactiveEffect(() => {
    console.log('ReactiveEffect2')
    const res = name1.value + name2.value + '2'
}, 'effect2')
effect1.run()
effect2.run()
```

当新建了ReactiveEffect的实例后，会调用run方法，自动执行传入的副作用函数，如果副作用函数内部有响应式变量，会触发该变量被劫持的get函数，在get函数内部，使用dep实例进行依赖收集，结合更好理解

下面用几张图来说明二维双向链表的建立过程，可以结合[1.watchEffect(3.手写reactiveEffect基础数据类型，多个sub依赖多个dep)](https://github.com/shenjipo/vue-study/blob/master/vue3/1.watchEffect(3.%E6%89%8B%E5%86%99reactiveEffect%E5%9F%BA%E7%A1%80%E6%95%B0%E6%8D%AE%E7%B1%BB%E5%9E%8B%EF%BC%8C%E5%A4%9A%E4%B8%AAsub%E4%BE%9D%E8%B5%96%E5%A4%9A%E4%B8%AAdep).html)比较容易理解，

![aa47d34299618023195614a01acfff3a_1246fb8c453feeb47982b329782ede81.png](http://101.133.143.249/api/getImage/aa47d34299618023195614a01acfff3a_1246fb8c453feeb47982b329782ede81.png)

![e5258479db29b6cce2ceba631540d30b_3dfce39be05a0bfb0ed1d87ef59b742c.png](http://101.133.143.249/api/getImage/e5258479db29b6cce2ceba631540d30b_3dfce39be05a0bfb0ed1d87ef59b742c.png)

![3000f548d9ffa6179b208c92a5216c8a_aed87a885fb73b9a0ff1ad6f7c046f36.png](http://101.133.143.249/api/getImage/3000f548d9ffa6179b208c92a5216c8a_aed87a885fb73b9a0ff1ad6f7c046f36.png)

![7a0d821d7ca0a24a25b93c52d1981642_3c130ffeefb027ee82dd5e1deecc9833.png](http://101.133.143.249/api/getImage/7a0d821d7ca0a24a25b93c52d1981642_3c130ffeefb027ee82dd5e1deecc9833.png)

![623cd218e212660cd7d13516b7aec07a_bca5c12ec9ceb895634145f5d6d8a963.png](http://101.133.143.249/api/getImage/623cd218e212660cd7d13516b7aec07a_bca5c12ec9ceb895634145f5d6d8a963.png)

![623cd218e212660cd7d13516b7aec07a_47f5456a0b2bb4bd635cdf19fd20c0d7.png](http://101.133.143.249/api/getImage/623cd218e212660cd7d13516b7aec07a_47f5456a0b2bb4bd635cdf19fd20c0d7.png)

![3c4922951532075b6906e63e2f55560a_b77549fe926fba1d3d11ae0c38949692.png](http://101.133.143.249/api/getImage/3c4922951532075b6906e63e2f55560a_b77549fe926fba1d3d11ae0c38949692.png)

![45d3464150ee52ecf877783e5f7fdad8_f740d397d619bd04f50bf2be57e5d1d3.png](http://101.133.143.249/api/getImage/45d3464150ee52ecf877783e5f7fdad8_f740d397d619bd04f50bf2be57e5d1d3.png)

![d4e6892fe08cd59b584ebe648af0bda4_afefa4b031b40ea45b5bec92de20d4a5.png](http://101.133.143.249/api/getImage/d4e6892fe08cd59b584ebe648af0bda4_afefa4b031b40ea45b5bec92de20d4a5.png)

![f2c0036bb772a32f733492e07d5ab4a0_6f82ec7d4773a1ef1439ec916c8c11eb.png](http://101.133.143.249/api/getImage/f2c0036bb772a32f733492e07d5ab4a0_6f82ec7d4773a1ef1439ec916c8c11eb.png)

![8bf89cf449fce0388ff00eef73c930b1_2630a10aeedbb143203c9b427a926c97.png](http://101.133.143.249/api/getImage/8bf89cf449fce0388ff00eef73c930b1_2630a10aeedbb143203c9b427a926c97.png)

![a4d39809e90e109dd0da2e0025c48817_2377b40c85131f579220938c7fbd4456.png](http://101.133.143.249/api/getImage/a4d39809e90e109dd0da2e0025c48817_2377b40c85131f579220938c7fbd4456.png)

![cb7a3f3fc356341ca6e924d721845e33_0456dddeaf624efa7fc2dbdee8b19b19.png](http://101.133.143.249/api/getImage/cb7a3f3fc356341ca6e924d721845e33_0456dddeaf624efa7fc2dbdee8b19b19.png)

![a3ae319b27b4bdb8ba22f95791a79858_4e9258432c0cba20cae212c993db00de.png](http://101.133.143.249/api/getImage/a3ae319b27b4bdb8ba22f95791a79858_4e9258432c0cba20cae212c993db00de.png)

![ea2dea03c039c217e324351b4153765c_93a1ad16fcc8234833394865f20d4984.png](http://101.133.143.249/api/getImage/ea2dea03c039c217e324351b4153765c_93a1ad16fcc8234833394865f20d4984.png)

![c03bc5a48f4efe45e741f4621b9aa95c_eb8e50805da98e123752c90e2e623cd7.png](http://101.133.143.249/api/getImage/c03bc5a48f4efe45e741f4621b9aa95c_eb8e50805da98e123752c90e2e623cd7.png)

![cc4c57d37cd3afce498e9b4846f5e076_cc7a05d7f507d69cbc90919601f02700.png](http://101.133.143.249/api/getImage/cc4c57d37cd3afce498e9b4846f5e076_cc7a05d7f507d69cbc90919601f02700.png)

依赖触发过程比较简单，有了上面的链表结构，可以通过`Dep1`的`subs`属性指向队列的尾部，也就是指向`Link3`。`Link3`中可以直接通过`sub`属性访问到订阅者`Sub2`，也就是第二个`watchEffect`，从而执行第二个`watchEffect`的回调函数。接着就是使用Link的`preSub`属性从队尾依次移动到队头，从而触发`Dep1`队列中的所有Sub订阅者。

## 非基本数据类型的响应式实现

vue3对于非基本数据类型数据的get和set劫持通过`Proxy`和`Reflect`api实现，`Proxy`本身也只能实现对象的浅层代理，因此与vue2类似，需要再get方法中判断子属性是否仍然为一个对象，然后去递归代理

实现的思路如下，具体细节可以参考[2.watchEffect(4.手写reactiveEffect对象数据类型，自动更新依赖)](https://github.com/shenjipo/vue-study/blob/master/vue3/2.watchEffect(4.%E6%89%8B%E5%86%99reactiveEffect%E5%AF%B9%E8%B1%A1%E6%95%B0%E6%8D%AE%E7%B1%BB%E5%9E%8B%EF%BC%8C%E8%87%AA%E5%8A%A8%E6%9B%B4%E6%96%B0%E4%BE%9D%E8%B5%96).html)

```javascript
function reactive(target){
    const proxy = new Proxy(target,{
        get(target,key,receiver){
              // 收集依赖
              track(target, key)
              const res = Reflect.get(target,key,receiver)
              // 递归实现响应式
              if (isObject(res)) {
                  return reactive(res);
              }
              return res
        }
        set(target,key,newValue,receiver){
              const oldValue = target[key]
              // 触发依赖
              trigger(target,key,newValue,oldValue)
              return Reflect.set(target,key,newValue,receiver)
        }
    })
    return proxy
}
```

可以看到，实现的思路与vue2高度相似，利用`Proxy`api劫持对象的get和set方法，在get方法中调用`track`函数收集依赖，在trigger函数中调用`trigger`函数触发副作用函数，需要注意的是，在处理依赖项dep时，与vue2略有不同

vue2中为了实现对象属性添加和删除的响应式，有两种dep实例，闭包中的dep以及挂在在对象的`__ob__`键上的dep实例，而`Proxy`api本身能够实现监听键值的增加与删除，因此，不需要两种dep实例，而是使用了一个全局的`WeakMap`对象来保存dep实例，例如对于如下一个响应式对象

```javascript
const p1 = ref({
    name: 'a', 
    child:{name: 'b'}
})
targetMap.set(p1, new Map())
const dep = targetMap.get(p1)
dep.set('name', new Dep())
dep.set('child', new Dep())
// 递归第二层
targetMap.set(p1.child, new Map())
const dep = targetMap.get(p1.child)
dep.set('name', new Dep())
```

![image_90048b6a5446efb9d082809804bf0f72.png](http://101.133.143.249/api/getImage/image_90048b6a5446efb9d082809804bf0f72.png)

可以看到，从整个对象开始，每一层非基本数据类型的对象数据必然有一个`Map`与之对应，通过全局的`targetMap`来维护`Map`，然后通过每一个对象的`Map`来维护每个key对应的`dep`，设计的非常简洁，从而很方便的**更新**或者**获取**某个key对应的dep实例，通过dep实例我们就可以按照自动收集依赖，构建前面介绍的二维链表结构，然后基于这个二维链表结构在`trigger`函数中触发对应的副作用函数


### 为什么ref生成的响应式数据需要.value而reactive不需要？

ref实现的响应式对于数据第一层的监听是通过`Object.defineProperty`劫持了xxx.value的get和set方法，而reactive通过`Proxy`实现了对于源对象的代理，不需要劫持特定key的get和set方法


## 参考文献

[参考文章-看不懂来打我！让性能提升56%的Vue3.5响应式重构](https://mp.weixin.qq.com/s/_KQyb9cQv-r-tR2gTT0ZCQ)
