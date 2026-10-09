---
title: "树分治——边分治"
date: 2022-07-11 15:28:21
updated: 2022-07-11 15:28:21
tags: ["洛谷","数据结构"]
categories: [洛谷旧文]
math: true
---

[推荐先去看这个](/posts/luogu-fykacss9/)
# 简介
 类似于点分治，边分治是每次将一条边删去，将整棵树分成两部分分治进行求解。比起点分治，每次只需考虑两部分的贡献，~~貌似比较轻松~~。

 ### 但是
 如果有一个菊花图：

![](/images/luogu/9gqvobfb.png)

就会被卡成$n^2$，怎么办呢？

### 三度化
考虑构建一些虚点和虚边，使得每个结点的度数不超过$3$

![](/images/luogu/3fqf5i6d.png)

虽然增大了空间和常数，但是保证了时间复杂度

```cpp
void rebuild(int u,int fa)
{
		int ff=0,f=0;
		for (int i=0;i<g[u].size();i++)
		{
			int v=g[u][i],w=c[u][i];
			if (v==fa) continue;
			if (!f)
			{
				f=1;
				add(u,v,w,1);
				add(v,u,w,1);
				ff=u;
			}
			else
			{
				cnt++;
				add(cnt,ff,0,0),add(ff,cnt,0,0);
				add(cnt,v,w,1),add(v,cnt,w,1);
				ff=cnt;
			}
			rebuild(v,u);
		}
}
```

PS：还有另一种重建方法，把它弄得像完全二叉树一样，个人觉得这种更好。

### 时间复杂度相关证明：
看上去应该和点分治一样是$O(nlog_2n)$。
#### 但是。如果有这样一颗完全三叉树

![](/images/luogu/t7mqxxve.png)

我们每次删边会使它的大小变成原来的$\frac{2}{3}$，所以正确的时间复杂度应该是$\Large\ O(nlog_\frac{3}{2}n)$。

所以空间不能开小了。

# 例题

###### [luogu P4149 [IOI2011]Race](https://www.luogu.com.cn/problem/P4149)
题目大意：
> 给一棵树，每条边有权。求一条简单路径，权值和等于 $k$，且边的数量最小。

一样的，考虑搞一个桶，维护前一部分的对应权值最小边数，用另一部分去匹配就好了。
```cpp
void dfs(int u,int fa,int dis,int line)
{
		re[++r].line=line;
		re[r].dis=dis;
		re[r].u=u;
		for (int i=head[u];i+1;i=e[i].nxt)
		{
			int v=e[i].v;
			if (v==fa||!v) continue;
			dfs(v,u,dis+e[i].dis,line+e[i].pd);
		}
}
void solve(int u)
{
		l=1,r=0;
		getrt(u,u);
		int sz=siz[u];
		for (int i=1;i<=r;i++)
		{
			int v=p[i];
			if (max(siz[v],sz-siz[v])<max(siz[u],sz-siz[u])) u=v;//找分治中心边
		}
		int uu=u,ed=-1;
		for (int i=head[u];i+1;i=e[i].nxt)
		{
			int v=e[i].v;
			if (!v) continue;
			if (siz[v]>siz[u]) 
			{
				uu=v,ed=i;
				break;
			}
		}
		e[ed].v=e[ed^1].v=0;//删边，注意要保证正向边为双数，反向边为单数。
		if (ed==-1) return ;
		l=1,r=0;
		dfs(u,u,0,0);
		for (int i=l;i<=r;i++)
			if (re[i].u<=n&&re[i].dis<=k) judge[re[i].dis]=min(judge[re[i].dis],re[i].line);
		l=r+1;
		dfs(uu,uu,e[ed].dis,e[ed].pd);
		for (int i=l;i<=r;i++)
			if (re[i].u<=n&&re[i].dis<=k) test=min(test,judge[k-re[i].dis]+re[i].line);
		for (int i=1;i<=r;i++) if (re[i].u<=n&&re[i].dis<=k) judge[re[i].dis]=inf;
		solve(u);
		solve(uu);
}
```

 ###### [评测记录](https://www.luogu.com.cn/record/79133062)
没想到我也调了$3h$，~~蚌埠住了~~。

# 待续~

---

原文发布于 2022-07-11 15:28:21（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/6erprmbe)。
