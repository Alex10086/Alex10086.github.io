---
title: "[DP][AGC022E] Median Replace"
date: 2023-11-09 10:18:51
updated: 2023-11-09 10:18:51
tags: ["洛谷","dp"]
categories: [洛谷旧文]
math: true
---

[**[AGC022E] Median Replace**](https://www.luogu.com.cn/problem/AT_agc022_e)

考虑如何判定一个序列合法

观察发现如果操作的三个数不相同，整个序列 $1$ 和 $0$ 的相对个数不改变 , 可以看成不同的两个数相抵消。

而操作相同的三个数时，这个数的总数减 $2$ 。

所以只要某个时刻 $1$ 的个数比 $0$ 多即可。所以策略应该是尽量多使得三个 $0$ 连在一起被消掉，考虑用栈模拟这个过程

可以得到：

- 如果当前是 $0$，前面连着两个 $0$ 就可以把前面两个 $0$ 消掉
- 如果当前是 $0$，前面是 $1$，则先不消，因为不知道后面是否有$0$
- 如果当前是 $1$，前面是 $0$，那么前面连着 $0$ 的个数一定 $\leq2$ 。若个数为 $2$ ，则当前 $1$与前一个 $0$ 抵消后，前一个 $0$ 还有与后面的 $0$ 的抵消的可能。若个数不为 $2$ ，消除后也无影响，并且发现这样可以使得栈中栈顶到栈底是一段连续的 $0$ 和一段连续的 $1$ 。
- 如果当前是 $1$ ，前面是 $1$ ，由于 $0$ 的个数 $\leq2$ ，所以保留最多 $2$ 个 $1$ 即可。

用 $f_{i,j,k}$ 表示前 $i$ 个数的栈中有 $j$ 个 $0$ , $k$ 个 $1$ ，按上面转移即可。


```cpp
#include <bits/stdc++.h>
using namespace std;
#define ll long long
//#define LOCAL
constexpr ll mo=1e9+7;
char s[300005];
int n;
ll f[300005][3][3]; 
signed main()
{
	#ifdef LOCAL
	freopen(".in","r",stdin);
	freopen(".out","w",stdout);
	#endif
	scanf("%s",s+1);n=strlen(s+1);
	f[0][0][0]=1;
	for (int i=1;i<=n;i++)
	{
		if (s[i]!='1')
			for (int j=0;j<=2;j++) f[i][1][j]=(f[i-1][0][j]+f[i-1][2][j])%mo,f[i][2][j]=f[i-1][1][j];
		if (s[i]!='0')
		{
			f[i][0][1]=f[i-1][0][0],f[i][0][2]=(f[i-1][0][1]+f[i-1][0][2])%mo;
			for (int j=1;j<=2;j++) 
				for (int k=0;k<=2;k++) f[i][j-1][k]=(f[i][j-1][k]+f[i-1][j][k])%mo;
		}
	}
	ll ans=0;
	for (int i=0;i<=2;i++)
		for (int j=i;j<=2;j++) ans=(ans+f[n][i][j])%mo;
	printf("%lld\n",ans); 
	return 0;
}
/**/

```


---

原文发布于 2023-11-09 10:18:51（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/vbhxutzc)。
