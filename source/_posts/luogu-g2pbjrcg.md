---
title: "SMOI 11.10 T1"
date: 2023-11-10 19:16:04
updated: 2023-11-10 19:16:04
tags: ["洛谷"]
categories: [洛谷旧文]
math: true
---

太菜了，没写出来，好好反思
# 题意
给定一颗有根树，每个点有点权，初始全为 $0$，每个时刻可以操作一个节点，使得其权值 异或上 $1$ ，并在下个时刻操作它的父亲，直到根节点。若一个节点被操作多次则两两抵消再向上传递。现在给定一个状态，求达到这个状态的最小时间。

$n\leq16$

# 分析

首先考虑状压搜索

发现每个时刻依次递增时强行维护需要维护 当前节点权值状态 和 被操作的节点状态 总状态是 $2^{32}$ 的，无法通过

观察不同时刻操作的最终影响，可以发现操作不需要按顺序，也就是我们可以将一次操作的影响全部放到树上

但是又发现操作的最终影响与选取的结束时间有关，对于这种最后状态参差不齐的情况，我们可以从后往前考虑，即固定结束的时刻，往前枚举距离结束只有 $1$ 秒，只有 $2$ 秒......的情况

那么可以想到做法：从后往前考虑，记 $f_{i,j}$ 为距离结束时间还有 $i$ ，当前树状态为 $j$ 是否可行，预处理出每个点向上的点即可

时间复杂度 $O(2^n·n^2)$

```cpp
#include <bits/stdc++.h>
using namespace std;
#define ll long long
//#define LOCAL
int n,t;
vector<int> to[17];
vector<int> st,rt[17];
bool f[1<<16][17]; 
void dfs(int u)
{
	st.emplace_back(u),rt[u]=st;
	reverse(rt[u].begin(),rt[u].end());
	for (auto v : to[u]) dfs(v);
	st.pop_back();
}
int sol()
{
	f[0][0]=1;
	for (int i=1;i<=2*n;i++)
	{
		for (int k=0;k<(1<<n);k++)
		{	
			f[k][i]|=f[k][i-1];
			if (!f[k][i-1]) continue;
			for (int j=1;j<=n;j++)
			{
				int u=k;
				for (int s=0;s<min((int)rt[j].size(),i);s++) u^=(1<<(rt[j][s]-1));
				f[u][i]=1;
			}
		}
		if (f[t][i]) return i;
	}
}
signed main()
{
	#ifdef LOCAL
	freopen("decoration.in","r",stdin);
	freopen("decoration.out","w",stdout);
	#endif
	scanf("%d",&n);
	for (int i=2,x;i<=n;i++) scanf("%d",&x),to[x].emplace_back(i);
	for (int i=1,x;i<=n;i++) scanf("%d",&x),(x)?t|=(1<<(i-1)):0;
	if (!t)
	{
		puts("0");
		exit(0);
	}
	dfs(1);
	printf("%d\n",sol());
	return 0;
}
/*
*/

```

~~不如QJJ大佬口结论拿大分~~

---

原文发布于 2023-11-10 19:16:04（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/g2pbjrcg)。
