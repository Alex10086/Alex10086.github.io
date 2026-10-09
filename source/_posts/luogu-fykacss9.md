---
title: "树分治——点分治"
date: 2022-07-09 08:51:50
updated: 2022-07-09 08:51:50
tags: ["洛谷","数据结构"]
categories: [洛谷旧文]
math: true
---


# 简介
* **用途** ：较为高效地处理大规模树上路径信息问题。

* **实现** ：任意选取一点作为无根树根结点，考虑将树上所有路径分类，一种经过根结点，另一种不经过。先将经过根结点的路径处理，再递归到子树中进行相同操作。

 ## 但是

这样做假如递归m层，共有n个点，其时间复杂度为 
$$O(nm)$$
十分的不稳定，很容易爆掉。那么如何优化呢？

 * **树的重心** ：若以该结点为根，使得其最大子树的结点数最小。举个栗子：

  ![](/images/luogu/y2i8n60b.png)

 此树现在以结点3为根，它的最大子树是以1儿子所在子树，结点数是4。但容易看出，如果以1为根
![](/images/luogu/w0r3w8yx.png)

 这样它的最大子树结点数就为3，结点1就是该树的重心

 那么如何求出树的重心呢？
 ```cpp
 void getrt(int u,int fa)
{
  		siz[u]=1; //当前处理的树中以u结点为根子树的结点数
  		maxp[u]=0;//u结点子树结点数最大值
		for(int i=head[u];i;i=e[i].nxt) 
		{
      		 int v=e[i].v;
     	  	 if(v==fa||vis[v]) continue;
     		 getrt(v,u);
      		 siz[u]+=siz[v];
	   	  	 maxp[u]=max(maxp[u],siz[v]); 
 		}
		maxp[u]=max(maxp[u],sum-siz[u]);//sum是当前处理的树的大小
		if(maxp[u]<maxp[rt]) rt=u;
}
```
做一遍是 $O(sum)$

* ###### **时间复杂度相关证明**
 求出重心又有什么用呢 ？ 
 若我们每次选取重心为根节点进行处理，那么其子树大小不会超过当前树大小的一半，每次分治下去最多大小只有一半，最多分治$log$层，每层有$n$个,其时间复杂度就是 
$$O(nlog_2n)$$

# 例题
###### [luogu P3806【模板】点分治1](https://www.luogu.com.cn/problem/P3806)
题目大意：
> 给定一棵有$n$个点的树，询问树上距离为$k$的点对是否存在。

~~就是板子啊~~ 经典的模板题，考虑一个个子树处理，维护一个桶记录之前的子树是否存在长度为$l$的路径，再将本子树路径求出与桶匹配，最后再将当前子树路径扔进桶里，继续寻找下一个子树的路径。本质就是将子树分开算贡献， 好处是不用去重。

主要代码:
 ```cpp
 void calc(int u)
{
		p[0]=0;//同下 
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			rem[0]=0;//rem[0]记录rem数组长度 
			dis[v]=e[i].dis;
			getdis(v,u);
			for (int j=1;j<=rem[0];j++)
				for (int k=1;k<=m;k++)
					if (q[k]>=rem[j]) test[k]|=judge[q[k]-rem[j]];
			for (int j=1;j<=rem[0];j++) 
			{
				if (rem[j]<=inf)//防止数组越界 
				{
					p[++p[0]]=rem[j];
					judge[rem[j]]=1;
				}
			}
		}
		for (int i=1;i<=p[0];i++) judge[p[i]]=0;//因为memset会爆掉 
		p[0]=0;
}
```
```cpp
void solve(int u)
{
			vis[u]=judge[0]=1;//因为在子树中挑选时有可能其中>一颗直接满足，另一颗就为0，此情况有贡献 所以judge[0]=1
			calc(u);
			for (int i=head[u];i;i=e[i].nxt)
			{
				int v=e[i].v;
				if (vis[v]) continue;
				sum=siz[v];
				rt=0,maxp[0]=inf;
				getrt(v,0);//此时子树独立出来，所以没有父亲，写0 
				solve(rt); 
			} 
}
```
 ###### [评测记录](https://www.luogu.com.cn/record/78375185)

PS：还有另一种做法，不将子树分开处理，排序后，一起计算贡献，最后再在子树里做一遍去重，这里不多赘述。

###### [luogu P4149 [IOI2011]Race](https://www.luogu.com.cn/problem/P4149)
题目大意：
> 给一棵树，每条边有权。求一条简单路径，权值和等于 $k$，且边的数量最小。

在桶中维护边数最小值即可

主要代码:
 ```cpp
void calc(int u)
{
		p[0]=0;
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			rem[0]=0;
			dis[v]=e[i].dis;
			line[v]=1;
			getdis(v,u);
			for (int j=1;j<=rem[0];j++)
			{
				if (m>rem[j]&&judge[m-rem[j]]) test=min(test,reline[j]+judge[m-rem[j]]);
				else if (m==rem[j]) test=min(test,reline[j]);
			}
			for (int j=1;j<=rem[0];j++) 
			{
				if (rem[j]<=inf)
				{
					p[++p[0]]=rem[j];
					if (!judge[rem[j]]) judge[rem[j]]=reline[j];
					else judge[rem[j]]=min(judge[rem[j]],reline[j]);
				
				}
			}
		}
		for (int i=1;i<=p[0];i++) judge[p[i]]=0;
		p[0]=0;
}    
```
 ###### [评测记录](https://www.luogu.com.cn/record/78381584)

###### [luogu P4178 Tree](https://www.luogu.com.cn/problem/P4178)

题目大意：
> 给定一棵 $n$ 个节点的树，每条边有边权，求出树上两点距离小于等于 $k$ 的点对数量。

考虑用树状数组维护前面子树中每个距离边数前缀和，注意当前边不与前面的边匹配也算一种。

主要代码：
```cpp
void calc(int u)
{
		p[0]=0;
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			rem[0]=0;
			dis[v]=e[i].dis;
			getdis(v,u);
			for (int j=1;j<=rem[0];j++)
				if (m>=rem[j]) 
					test+=Sum(m-rem[j])+1;//0也算1个
			for (int j=1;j<=rem[0];j++) 
			{
				if (rem[j]<=inf)
				{
					p[++p[0]]=rem[j];
					add(rem[j],1);
				}
			}
		}
		for (int i=1;i<=p[0];i++) add(p[i],-1);
		p[0]=0;
}
```
 ###### [评测记录](https://www.luogu.com.cn/record/78392117)

###### [luogu SP1825 FTOUR2 - Free tour II](https://www.luogu.com.cn/problem/SP1825)

题目大意：
> 给定一棵$n$个点的树，树上有$m$个黑点，求出一条路径，使得这条路径经过的黑点数小于等于$k$，且路径长度最大

考虑用树状数组以黑点个数作为序号维护长度的前缀最大值

 ###### [评测记录](https://www.luogu.com.cn/record/79089893)

###### [P3714 [BJOI2017]树的难题](https://www.luogu.com.cn/problem/P3714)
题目大意：
> 给定一棵$n$个点的树，每条边都有一个颜色$i$，每个颜色都有一个权值$c_i$，一条简单路径中连续相同颜色权值只算一次。给出$l$、$r$,求边数在$l$到$r$内，简单路径权值最大值

因为本题要维护边数和颜色两个值，硬做是$n^2$，会爆掉，考虑将子树按颜色排序，用两个线段树，以边数为序号，维护区间内相同颜色和不同颜色最大值，颜色改变时，把相同颜色的线段树扔到不同颜色的即可。时间复杂度是$O(nlog^2n)$ 

细节较多，别忘了懒标记

主要代码：
```cpp
void calc(int u)
{
		int lastco=0,sr=0;
		for (int i=1;i<=sm;i++)
		{
			int v=son[i].v;
			if (vis[v]) continue;
			cnt=0;
			dis[v]=co[son[i].co];
			line[v]=1;
			getdis(v,u,son[i].co,son[i].co);
			if (lastco&&son[i].co!=lastco)
			{
				for (int j=1;j<=sr;j++) dif.update(1,1,n,j,sam.query(1,1,n,j,j));
				sam.clear();
				sr=0;
				lastco=son[i].co;
			}
			else if (!lastco) lastco=son[i].co;
			for (int j=1;j<=cnt;j++)
			{			
				if (rem[j].line>=l&&rem[j].line<=r) test=max(test,rem[j].dis);
				if (rem[j].line>=r) continue;
				test=max(test,max(sam.query(1,1,n,max(1,l-rem[j].line),r-rem[j].line)-co[rem[j].co],dif.query(1,1,n,max(1,l-rem[j].line),r-rem[j].line))+rem[j].dis);
			}
			for (int j=1;j<=cnt;j++) 
			{
				if (rem[j].dis<=inf)
				{
					sr=max(sr,rem[j].line);
					sam.update(1,1,n,rem[j].line,rem[j].dis);
				}
			}
		}
		dif.clear();
		sam.clear();
}
```
PS：貌似有单调队列做法，但有个同学被卡常了，不敢打
 ###### [评测记录](https://www.luogu.com.cn/record/78483236)

###### [P5351 Ruri Loves Maschera](https://www.luogu.com.cn/problem/P5351)
题目大意：
> 给定一棵$n$个点的树，每条边都有一个权值$v_i$，规定一条简单路径权值为经过边权值的最大值，给出$l$、$r$，求经过边数在$l$到$r$之间所有路径权值和。

>注意：$x$到$y$和$y$到$x$算两条不同的路径

因为是维护整条路径的最大值，所以子树分开算不好处理。考虑将子树排序后用两个指针遍历所有路径，用树状数组维护以边数为序号的前缀最大值，再在子树里跑一遍把重复的减掉。

主要代码：
```cpp
bool cmp1 (int a,int b){
		if (magic[a]!=magic[b]) return magic[a]<magic[b];
		return line[a]<line[b];
} 
bool cmp2 (int a,int b){
		if (f[a]!=f[b]) return f[a]<f[b];
		return magic[a]<magic[b];
}
void calc(int u)
{
		p[0]=0;
		p[++p[0]]=u;
		dis[u]=0;
		f[u]=u;
		magic[u]=0;
		line[u]=0;
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			dis[v]=e[i].dis;
			magic[v]=e[i].dis;
			line[v]=1;
			getdis(v,u,v);
		}
		sort(p+1,p+1+p[0],cmp1);
		for (int i=1;i<=p[0];i++)
		{
			if (line[p[i]]>R) continue;
			if (line[p[i]]>=L) test+=magic[p[i]];
			test+=1ll*magic[p[i]]*(mag.Sum(R-line[p[i]])-mag.Sum(max(0,L-line[p[i]]-1)));
			mag.add(line[p[i]],1);
		}
		for (int i=1;i<=p[0];i++) 
		{	
			if (line[p[i]]>R) continue;
			mag.add(line[p[i]],-1);
		} 
		sort(p+1,p+1+p[0],cmp2);
		int last=1;
		for (int i=1;i<=p[0];i++)
		{
			if (line[p[i]]>=R) continue;
			if (f[p[i]]!=f[p[i-1]]&&i>1) 
			{
				for (int j=last;j<i;j++) 
				{
					if (line[p[i]]>=R) continue;
					mag.add(line[p[j]],-1);
				}
				last=i;
			}
			test-=1ll*magic[p[i]]*(mag.Sum(R-line[p[i]])-mag.Sum(max(0,L-line[p[i]]-1)));
			mag.add(line[p[i]],1);
		} 
		for (int i=last;i<=p[0];i++) 
		{
			if (line[p[i]]>=R) continue;
			mag.add(line[p[i]],-1);
		}
}
```
PS：~~十年OI一场空，不开longlong见祖宗~~
 ###### [评测记录](https://www.luogu.com.cn/record/78539787)

###### [CF293E Close Vertices](https://www.luogu.com.cn/problem/CF293E)
题目大意：
> $n$个点的树，每条边长度为$1$，权值为$w_i$，给定$l$、$w$,求有多少条简单路径长度不超过$l$，权值不超过$w$。

和上一题差不多，按边权排序，用树状数组存前缀和,一起算再去重。注意一下输入格式就好了。

主要代码：
```cpp
bool cmp1 (int a,int b){
		if (dis[a]!=dis[b]) return dis[a]<dis[b];
		return line[a]<line[b];
} 
bool cmp2 (int a,int b){
		if (f[a]!=f[b]) return f[a]<f[b];
		return dis[a]<dis[b];
}
void calc(int u)
{
		p[0]=0;
		p[++p[0]]=u;
		dis[u]=0;
		f[u]=u;
		line[u]=0;
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			dis[v]=e[i].dis;
			line[v]=1;
			getdis(v,u,v);
		}
		sort(p+1,p+1+p[0],cmp1);
		for (int i=1;i<=p[0];i++) 
		{
			mag.add(line[p[i]],1);
			trsiz[f[p[i]]]++;
		}
		int le=1,ri=p[0];
		while (le<ri)
		{
			if (dis[p[le]]+dis[p[ri]]<=w)
			{
				mag.add(line[p[le]],-1);
				test+=mag.Sum(l-line[p[le]]);
				le++;
			}
			else if (dis[p[ri]]+dis[p[le]]>w)
			{
				mag.add(line[p[ri]],-1);
				ri--;
			}  
		}
		mag.add(line[p[le]],-1);
		sort(p+1,p+1+p[0],cmp2);
		le=1;ri=2;
		int last=0;
		while (le<=p[0]&&ri<=p[0])
		{
			if (le==1||f[p[le]]!=f[p[le-1]])
			{
				ri=le+trsiz[f[p[le]]]-1;
				last=ri;
				for (int i=le;i<=ri;i++) mag.add(line[p[i]],1);
			}
			while (le<ri)
			{
				if (dis[p[le]]+dis[p[ri]]<=w)
				{
					mag.add(line[p[le]],-1);
					test-=mag.Sum(l-line[p[le]]);
					le++;
				}
				else if (dis[p[ri]]+dis[p[le]]>w)
				{
					mag.add(line[p[ri]],-1);
					ri--;
				}  
			}
			mag.add(line[p[le]],-1);
			le=last+1;
		}
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue; 
			trsiz[v]=0;
		}
}
```
~~又长又臭。~~其实有更为阳间的写法：把求dis扔到solve里，用calc返回答案，去重时只要把子树重心扔到calc里，再减去它就好了。~~懒得打。~~
 ###### [评测记录](https://www.luogu.com.cn/record/78549112)

###### [[COCI2018-2019#5] Transport](https://www.luogu.com.cn/problem/P5306)
题目大意：
>一棵树，每个点有有点权，每条边有边权，到达一个点可以加上这个点的点权，经过一条边要减去边权，总权值不能小于$0$。问起点和终点有几种情况。

考虑将边分类，一类为从某个点到根节点剩多少油，一类为从根节点到某个点最少出发时需要多少油。再在子树里跑一遍去重就好了。

主要代码：
```cpp
int calc(int u)
	{
		sort(lai+1,lai+1+lai[0]);
		sort(zou+1,zou+1+zou[0]);
		int l=1,sum=0;
		for (int i=lai[0];i>=1;i--)
		{
			while (zou[l]+lai[i]-oil[u]<0&&l<=zou[0]) l++;
			sum+=zou[0]-l+1;
		}
		return sum;
}
void solve(int u)
{
		vis[u]=1;
		lai[0]=0;
		zou[0]=0;
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			getdis(v,u,oil[u]-e[i].dis,min(0ll,-e[i].dis),min(0ll,oil[u]-e[i].dis));
		}
		test+=lai[0];
		for (int i=1;i<=zou[0];i++) if (zou[i]>=0) test++;
		test+=calc(u);
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			lai[0]=0;
			zou[0]=0;
			getdis(v,u,oil[u]-e[i].dis,min(0ll,-e[i].dis),min(0ll,oil[u]-e[i].dis));
			test-=calc(u);
		}
		for (int i=head[u];i;i=e[i].nxt)
		{
			int v=e[i].v;
			if (vis[v]) continue;
			sum=siz[v];
			rt=0,maxp[0]=inf;
			getrt(v,0);
			solve(rt); 
		} 
}
```
 ###### [评测记录](https://www.luogu.com.cn/record/78634245)

###### [P4886 快递员](https://www.luogu.com.cn/problem/P4886)
题目大意：
>给定一棵树，每条边有边权，给出几组起点和终点，要求在树上选取一个点，使得起点到该点再到终点的几组权值和中最大的最小，输出这个值

我们可以发现，若起点和终点不在同一子树，那么此时它们到根节点的距离不可能在减小。反之，则可以减小。也就是说，没有距离可以增大。要减小距离，只能往它们的子树跑。

所以我们先求出当前最大距离，若最大距离的起点与终点（多组中只要有一组）不在同一子树，那么这个距离不可能减小，其他距离不可能增大，所以答案就是它。若当前最大距离的起点与终点有多组属于不同的同一子树，那么往这个子树跑，另一边又会增大，所以当前答案就是最终答案。唯一一种可能是它（们）都属于同一子树。那么每次往那个子树跑就好，最多跑$log_2n$次，可以过。

处理一下跑到不同子树时，其他子树中的点到当前根节点的距离就好。
 ###### [评测记录](https://www.luogu.com.cn/record/78677947)



# 待续~

---

原文发布于 2022-07-09 08:51:50（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/fykacss9)。
