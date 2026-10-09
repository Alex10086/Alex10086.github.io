---
title: "[trick][AGC034D] Manhattan Max Matching"
date: 2023-11-09 11:32:44
updated: 2023-11-09 11:32:44
tags: ["洛谷","trick"]
categories: [洛谷旧文]
math: true
---

[**[AGC034D] Manhattan Max Matching**](https://www.luogu.com.cn/problem/AT_agc034_d)

容易想到建出图跑费用流，但是有$n^2$条边，这时有一个 $Trick$ ，考虑曼哈顿距离的形式。

$d_{i,j}=|x_i-x_j|+|y_i-y_j|$

$=max(x_i-x_j+y_i-y_j,-x_i+x_j+y_i-y_j,x_i-x_j-y_i+y_j,-x_i+x_j-y_i+y_j)$

$=max((x_i+y_i)+(-x_j-y_j),(-x_i+y_i)+(x_j-y_j),(x_i-y_i)+(-x_j+y_j),(-x_i-y_i)+(x_j+y_j))$

然后因为原题也在求 $max$ ,所以两个 $max$ 可以合在一起

所以建出二分图后，中间再建四个点依次连边即可


```cpp
#include<bits/stdc++.h>
#define LL long long
//#define FILE
#define inf 1e9
using namespace std;
int n,s,t;
struct edge
{
    int to,nxt,val,dis;
}e[100005];
int tot=1,head[5005];
void add(int u,int v,int w,int c)
{
    e[++tot].nxt=head[u];
    e[tot].to=v,e[tot].val=w,e[tot].dis=c;
    head[u]=tot;
}
void addx(int u,int v,int w,int c){add(u,v,w,c),add(v,u,0,-c);}
int rev[5005];
LL flow[5005],dis[5005];
bool vis[5005];
queue<int> q;
pair<LL,LL> min_cost(int s,int t)
{
    LL res=0,sum=0;
    while (1)
    {
        memset(dis,0x3f,sizeof dis);
        memset(vis,0,sizeof vis);
        flow[s]=1e18,dis[s]=0,q.push(s);
        while (!q.empty())
        {
            int u=q.front();
            q.pop(),vis[u]=0;
            for (int i=head[u];i;i=e[i].nxt)
            {
                int v=e[i].to,w=e[i].val,c=e[i].dis;
                if (w&&dis[u]+c<dis[v])
                {
                    flow[v]=min(flow[u],w*1ll);
                    dis[v]=dis[u]+c;rev[v]=i;
                    if (!vis[v]) q.push(v),vis[v]=1;
                }
            }
        }
        if (dis[t]>1e18) return make_pair(res,sum);
        sum+=dis[t]*flow[t];
        res+=flow[t];
        for (int i=t;i!=s;i=e[rev[i]^1].to)	e[rev[i]].val-=flow[t],e[rev[i]^1].val+=flow[t];
    }
}
signed main()
{
    #ifdef FILE
    freopen(".in","r",stdin);
    freopen(".out","w",stdout);
    #endif
    scanf("%d",&n);
    int p1=2*n+1,p2=p1+1,p3=p2+1,p4=p3+1;s=p4+1,t=s+1;
    for (int i=1;i<=n;i++)
    {
        int x,y,z;
        scanf("%d%d%d",&x,&y,&z);
        addx(s,i,z,0);
        addx(i,p1,inf,x+y),addx(i,p2,inf,x-y),addx(i,p3,inf,-x+y),addx(i,p4,inf,-x-y);
    }
    for (int i=1;i<=n;i++)
    {
        int x,y,z;
        scanf("%d%d%d",&x,&y,&z);
        addx(i+n,t,z,0);
        addx(p1,i+n,inf,-x-y),addx(p2,i+n,inf,-x+y),addx(p3,i+n,inf,x-y),addx(p4,i+n,inf,x+y);
    }
    printf("%lld",-min_cost(s,t).second);

    return 0;
}
```


---

原文发布于 2023-11-09 11:32:44（UTC+8），迁移自[洛谷专栏](https://www.luogu.com/article/qy981yqf)。
