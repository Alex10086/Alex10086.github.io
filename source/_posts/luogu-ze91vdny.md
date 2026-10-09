---
title: "集训杂题3"
date: 2022-07-15 21:04:17
updated: 2022-07-15 21:04:17
tags: ["洛谷"]
categories: [洛谷旧文]
math: true
---

#### [D - Union of Interval](https://atcoder.jp/contests/abc256/tasks/abc256_d)
>题目大意：
>>给定$n$个集合，让你合并，使得最后集合数最小。

>就是一个区间合并。先建个结构体按开头排个序。再遍历结尾合并就好了。

> ##### [评测记录](https://atcoder.jp/contests/abc256/submissions/33228456)

#### [E - Takahashi's Anguish](https://atcoder.jp/contests/abc256/tasks/abc256_e)
>题目大意：
>>有$n$个同学要排座位，每个同学都对另一个同学有一定的怨气值，若讨厌的人坐他们前面，他们就会很生气。求出总怨气值最小值。

>考虑建一个图，$a$对$b$有$c$的怨气值，则由$a$向$b$连一条权值为$c$的边。我们发现，整个图形都是由链和环组成的。对于一条链，我们只要反着做，就能保证没有怨气。所以先跑一边拓扑排序消掉链。对于一个环，必定有一个同学被后面的人所怨恨，考虑遍历一遍环，找到最小的怨气值贡献给答案。

> ##### [评测记录](https://atcoder.jp/contests/abc256/submissions/33241760)

#### [F - Cumulative Cumulative Cumulative Sum](https://atcoder.jp/contests/abc256/tasks/abc256_f)
>题目大意：
>>给定一个数列$A$，$B$是$A$的前缀和，$C$是$B$的前缀和，$D$是$C$的前缀和。
>>有两种操作
>>* 将$A$中某个数替换为$x$
>>* 求$D[x]$的值

>看到前缀和和区间修改，我们想到用树状数组，但维护什么呢?
>我们发现：

>* $B[x]=A[1]+A[2]+…+A[x]=\large \sum_{i = 1}^{x} A[i]$

>* $C[x]=x*A[1]+(x-1)*A[2]+…+A[x]=\large \sum_{i = 1}^{x} (x-i+1)A[i]$

>* $D[x]=(1+2…+x)A[1]+(1+2+…+x-1)A[2]+…+A[x]=*A[1]+\frac{(x-1)x}{2}A[2]+…A[x]=large \sum_{i = 1}^{x}\frac{(x-i+2)(x-i+1)}{2} A[i]$

>我们可以把$x$当作一个常数，从而使得$D[x]=\large \sum_{i = 1}^{x}(x-1)(x+2)A[i]-(2x+3)i*a[i]+i^2*a[i]$

>我们可以用树状数组预处理出$a[i]$，$i*a[i]$，$i^2*a[i]$的前缀和。最后统计答案就好了。

>##### 你以为结束了吗？
>注意到$\frac{1}{2}$，我们是在取模的情况下除二，所以需要求一个乘法逆元。

>还有，在$AtCoder$上交一定要模很多次。~~别问我怎么知道的~~

> ##### [评测记录](https://atcoder.jp/contests/abc256/submissions/33231229)

---

原文发布于 2022-07-15 21:04:17（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/ze91vdny)。
