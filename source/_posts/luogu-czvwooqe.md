---
title: "[trick][AGC044C] Strange Dance"
date: 2023-11-10 21:57:17
updated: 2023-11-10 21:57:17
tags: ["洛谷","trick"]
categories: [洛谷旧文]
math: true
---

[**[AGC044C] Strange Dance**](https://www.luogu.com.cn/problem/AT_agc044_c)

$Trick :$ $Trie$ 树支持全局加 $1$

考虑二进制时的做法，容易想到 $Trie$ 树，需要维护

- 交换 $01$ 儿子：打 $tag$ 就好
- 全局 $+1$ ：模拟一下，发现交换$01$儿子，在递归进新的 $0$ 儿子继续进位就好

这题建出三进制 $Trie$ 树即可，同样的
- 交换 $12$ 儿子
- 全局 $+1$ ：按照加的顺序交换，递归进 $0$ 儿子

```cpp
#include <bits/stdc++.h>
using namespace std;
#define ll long long
//#define LOCAL
int n,k,b[13],ans[1000005],rt;
struct Trie{
	int son[1000005][3],sz,val[1000005];
	bool tg[1000005];
	void build(int &u,int dep,int now){
		u=++sz;
		if (dep==k) return val[u]=now,void();
		for (int i=0;i<3;i++) build(son[u][i],dep+1,now+b[dep]*i);
	}
	void push_down(int u){
		if (!tg[u]) return ;
		swap(son[u][1],son[u][2]);
		for (int i=0;i<3;i++) tg[son[u][i]]^=1;
		tg[u]=0;
	}
	void add(int u){
		if (!son[u][0]) return ; 
		push_down(u);
		swap(son[u][2],son[u][1]),swap(son[u][1],son[u][0]); 
		add(son[u][0]);
	}
	void dfs(int u,int dep,int now){
		if (dep==k) return ans[val[u]]=now,void();
		push_down(u);
		for (int i=0;i<3;i++) dfs(son[u][i],dep+1,now+b[dep]*i);
	}
}T;
char t[200005];
signed main()
{
	#ifdef LOCAL
	freopen(".in","r",stdin);
	freopen(".out","w",stdout);
	#endif
	scanf("%d%s",&k,t+1);b[0]=1;
	for (int i=1;i<=k;i++) b[i]=b[i-1]*3;
	T.build(rt,0,0),n=b[k];int len=strlen(t+1);
	for (int i=1;i<=len;i++){
		if (t[i]=='S') T.tg[rt]^=1;
		else T.add(rt);
	}T.dfs(rt,0,0);
	for (int i=0;i<n;i++) printf("%d ",ans[i]);
	return 0;
}
/*
*/
```


---

原文发布于 2023-11-10 21:57:17（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/czvwooqe)。
