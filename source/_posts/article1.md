---
title: 学习式路径规划论文归纳
date: 2026-10-17 13:03:44
description: 和gpt交流得到，可以作为论文解读或者科研方向框架
tags:
  - 学习笔记、无人机、路径规划
categories: []
---
可以。现在把你们“第二部分：学习式路径/轨迹规划”彻底捋成一个统一框架。

先给你一句最重要的总纲：

$$
\boxed{
\text{环境}
\overset{1}{\longrightarrow}
\text{候选/粗轨迹}
\overset{2}{\longrightarrow}
\text{动力学可执行轨迹}
\overset{3}{\longrightarrow}
\text{轨迹得分}
\overset{4}{\longrightarrow}
\text{更新网络}
}
$$

其中前三步是“**一次规划时在干什么**”，第四步是“**训练阶段如何让网络越来越会规划**”。

而你们真正部署之后，第四步通常消失：

$$
\boxed{
\text{Point Cloud + State + Goal}
\rightarrow
\text{训练好的网络}
\rightarrow
\text{轨迹}
\rightarrow
\text{OMMPC}
}
$$

下面我严格按你要的四部分讲。

---

# 0. 先明确：网络到底在哪里？

网络一般主要在第一部分，或者直接把第一、第二部分一起吃掉。

例如：

$$
o=
(\text{PointCloud},v,a,goal)
$$

输入网络：

$$
f_\theta(o)
$$

输出：

$$
\tau
$$

这里 \(\theta\) 是网络参数。

所以网络最终学的是：

> **“看到这种环境、当前速度和目标，我应该生成什么轨迹。”**

第三部分评价器则负责告诉它：

> “你刚刚生成的东西到底好不好。”

第四部分再负责：

> “既然不好，怎么修改 \(\theta\)，让你下次生成得更好。”

因此可以记成：

$$
\boxed{\text{网络负责答题}}
$$

$$
\boxed{\text{评价器负责批卷}}
$$

$$
\boxed{\text{训练算法负责根据批改意见让网络进步}}
$$

---

# 第一部分：生成粗轨迹 / Candidate Generation

## 1.1 这一部分到底解决什么？

它回答：

> **我大概应该从哪里走？**

例如：

```text
              障碍物
           ┌─────────┐

候选 A  ←  左边绕

候选 B  ↑  上面绕

候选 C  →  右边绕
```

这里首先关心：

- 从哪个拓扑方向绕；
- 大致经过哪些区域；
- 有哪些值得探索的候选；
- 不要一开始就陷入很差的局部最优。

此时输出可以只是：

$$
P_0,P_1,\ldots,P_m
$$

几个 waypoint。

也可以已经比较高级，直接输出：

$$
\tau_i(t)
$$

若干初步轨迹。

---

## 1.2 传统方法怎么做？

最经典的就是：

$$
A^*,\quad RRT/RRT^*,\quad Kinodynamic\ A^*
$$

例如 A*：

```text
当前点
 ↓
搜索可行节点
 ↓
比较累计代价
 ↓
扩展
 ↓
直到目标
```

它每遇到一个新环境都现场搜索。

优点：

- 很可解释；
- 可控；
- 不需要训练；
- 非常适合 baseline。

缺点：

- 每次重新搜索；
- 高维状态空间可能慢；
- 很难把过去一百万个场景的“经验”利用起来。

---

# 1.3 Motion Primitive：YOPO 很典型

YOPO 的思想并不是：

> 网络凭空画一条轨迹。

而是先定义很多 **motion primitive anchors**，大致覆盖：

```text
左上  上  右上
左    前   右
左下  下  右下
```

然后网络针对每一个 primitive 预测：

- endpoint offset；
- terminal derivative；
- cost/score 等。

也就是说：

$$
\text{固定候选结构}
+
\text{NN修正}
$$

网络一次 forward 就能产生多条不同候选。

YOPO 2024 的核心正是把传统 perception → search → optimization 尽量压缩成 single-stage learned planner，并用 motion primitives 覆盖搜索空间。[alphaXiv](https://www.alphaxiv.org/abs/2505.18714v1?utm_source=chatgpt.com)

这对你们很重要，因为它告诉你：

> **网络生成候选不一定意味着完全自由生成。**

完全可以：

$$
\boxed{\text{传统结构提供搜索空间，网络学习怎么修正}}
$$

---

# 1.4 Diffusion：特别适合“生成多个不同候选”

这是 2025–2026 很明显的一条趋势。

传统普通网络可能：

$$
o\rightarrow\tau
$$

同样输入基本总给同一种输出。

但 diffusion 天生适合：

$$
o\rightarrow
\{\tau_1,\tau_2,\tau_3,\ldots\}
$$

也就是“多模态”。

比如障碍两侧都能走：

```text
        ┌──────┐
     ↗          ↖
   左绕          右绕
```

diffusion 可以同时产生两个 mode。

2026 的 **AeroDiffusion** 已经在四旋翼动态环境里做了：

$$
\text{temporal depth + state}
\rightarrow
\text{conditional diffusion}
\rightarrow
\text{multiple future 3D trajectories}
$$

然后再经过 preference-guided batch selection 选轨迹，并用 warm-start denoising 满足 onboard 实时重规划。[DOI](https://doi.org/10.1109/LRA.2026.3728285?utm_source=chatgpt.com)

所以如果你们特别重视：

> **一次产生多个候选，再从里面选。**

Diffusion 是非常合理的生成器。

---

# 1.5 LLM / VLM 适合放在哪里？

如果你们负责人说：

> “让大模型生成候选路线。”

比较合理的版本不是：

$$
\text{点云}\rightarrow LLM\rightarrow
100个精确(x,y,z,t)
$$

而是：

$$
\text{场景语义/拓扑}
\rightarrow LLM/VLM
\rightarrow
\text{high-level proposal}
$$

比如：

- 从左侧宽通道走；
- 从障碍物上方走；
- 先下降，再穿过右边；
- 输出几个 sparse waypoint。

然后第二部分把它数值化。

也就是说：

$$
\boxed{\text{LLM擅长决定“走哪种策略”}}
$$

而：

$$
\boxed{\text{轨迹优化器擅长决定“精确怎么飞”}}
$$

如果只是你们这种 **10 m 左右、纯几何避障、高速飞行**，我现在仍然认为 motion primitive / diffusion 比 LLM 直接生成精确轨迹更自然。

---

# 第一部分的代表论文

| 方法 | 代表工作 | 你主要看什么 |
|---|---|---|
| 搜索 | EGO / Kinodynamic 系 | 候选路径怎么搜 |
| Motion Primitive + NN | **YOPO 2024** | 网络如何一次生成多个结构化候选 |
| Diffusion | **AeroDiffusion 2026** | 如何学多模态候选分布 |
| 混合生成 | Fast Trajectory Generation via Energy-Guided Flow Matching 2026 | 学习几何路径，同时利用优化梯度指导生成 |

2026 的 Energy-Guided Flow Matching 甚至明确把“几何 path generation”和“动力学 trajectory optimization”分开，然后用最优控制问题产生的 cost gradient 去指导生成模型。这个结构跟你现在这四层理解非常吻合。[IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/11658268/?utm_source=chatgpt.com)

---

# 第二部分：把粗路径优化成真正“可飞”的轨迹

这一部分非常重要。

因为：

$$
\boxed{\text{Path}\neq\text{Trajectory}}
$$

---

## 2.1 粗路径只有“去哪”

比如：

$$
P_0\rightarrow P_1\rightarrow P_2\rightarrow P_3
$$

只能告诉无人机：

> 从这里绕。

但是没有告诉它：

- 什么时候到；
- 飞多快；
- 加速度多少；
- 怎么转弯；
- 推力是否够；
- 轨迹是否连续。

---

## 2.2 真正的 trajectory 是

$$
p(t)
$$

而进一步：

$$
v(t)=\dot p(t)
$$

$$
a(t)=\ddot p(t)
$$

$$
j(t)=\dddot p(t)
$$

甚至 snap。

所以：

```text
粗 waypoint/path
       ↓
trajectory optimization
       ↓
p(t), v(t), a(t)...
```

这条才能真正交给你的 OMMPC。

---

# 2.3 这一层通常优化什么？

典型 objective：

$$
J=
\lambda_sJ_{\rm smooth}
+
\lambda_cJ_{\rm collision}
+
\lambda_tJ_{\rm time}
+
\lambda_dJ_{\rm dynamics}
$$

其中：

### 平滑

例如：

$$
J_{\rm smooth}
=
\int\|j(t)\|^2dt
$$

---

### 碰撞

轨迹离障碍太近：

$$
J_{\rm collision}\uparrow
$$

---

### 时间

$$
J_{\rm time}=T
$$

你们想飞快，就会让它尽量小。

---

### 动力学

例如：

$$
\|v\|\le v_{\max}
$$

$$
\|a\|\le a_{\max}
$$

等等。

---

# 2.4 常见轨迹表示

典型有：

$$
Polynomial
$$

$$
B\text{-}Spline
$$

$$
MINCO
$$

比如多项式：

$$
p(t)=a_0+a_1t+\cdots+a_nt^n
$$

优化器真正调整的是：

$$
a_0,a_1,\ldots,a_n
$$

以及各 segment 的时间。

---

# 2.5 EGO-Planner 就属于很典型的这一类

EGO-Planner 用梯度优化局部轨迹：

- smoothness；
- collision；
- dynamical feasibility；

并且当发现动力学不可行时，会调整时间分配等。[arXiv](https://arxiv.org/abs/2008.08835?utm_source=chatgpt.com)

你可以把它看成：

$$
\boxed{\text{粗 path}\rightarrow\text{高质量 trajectory}}
$$

---

# 2.6 网络和第二部分可以是什么关系？

这里有三种架构。

### 架构 A：网络只负责第一步

```text
PointCloud
 ↓
NN
 ↓
waypoints
 ↓
MINCO
 ↓
trajectory
```

最稳。

---

### 架构 B：网络直接输出 trajectory 参数

例如：

$$
NN\rightarrow
\text{polynomial coefficients}
$$

这样网络已经把一部分 refinement 学进去了。

---

### 架构 C：Network + optimization layer

这是现在非常有意思的路线：

$$
NN\rightarrow
\text{initial trajectory}
\rightarrow
optimizer
\rightarrow
\text{feasible trajectory}
$$

2025 RA-L 的 **Dynamically Feasible Trajectory Generation With Optimization-Embedded Networks for Autonomous Flight** 就明确研究 optimization-embedded network，让学习生成与动力学可行性优化结合，而不是把 trajectory optimization 完全黑盒化。[dblp](https://dblp.org/rec/journals/ral/HanXPG25.html?utm_source=chatgpt.com)

所以：

$$
\boxed{\text{网络不一定替代优化器}}
$$

现在很多前沿方法反而是：

$$
\boxed{\text{Learning + Optimization}}
$$

---

# 第三部分：评价轨迹——到底什么叫“好”？

现在假设已经有：

$$
\tau_1,\tau_2,\dots,\tau_K
$$

问题变成：

$$
\boxed{\text{选谁？}}
$$

而且这一步不仅用于部署时选择候选，还能在训练时“教网络”。

这是我们前面讨论最多的一块。

---

# 3.1 第一类：全部显式 cost

最传统：

$$
J(\tau)=
w_1L
+w_2T
+w_3J_{\rm collision}
+w_4J_{\rm smooth}
+w_5J_{\rm dynamics}
$$

其中：

- \(L\)：长度；
- \(T\)：时间；
- collision：安全；
- smoothness：平滑；
- dynamics：速度/加速度等。

然后：

$$
\tau^*=
\arg\min_iJ(\tau_i)
$$

优势：

$$
\boxed{\text{极其可解释}}
$$

比如能明确说：

> B 比 A 长 0.2m，但是所需加速度小 40%，因此总 cost 更低。

---

# 3.2 第二类：显式 cost + learned trackability

这个我认为**最适合你们和 OMMPC 结合**。

为什么？

因为：

$$
L(\tau)
$$

容易算。

$$
T(\tau)
$$

容易算。

障碍物距离：

$$
d(\tau,\mathcal O)
$$

也能算。

但有一个东西非常难：

> **OMMPC 实际跟踪这条轨迹到底会怎么样？**

例如：

- 最大 tracking error；
- motor saturation；
- body-rate saturation；
- 实际完成时间；
- 控制余量；
- 高速弯道是否失跟。

它们取决于：

$$
\text{trajectory}
+
\text{dynamics}
+
\text{controller}
$$

很难手写一个非常准确的解析式。

所以可以采数据：

$$
(\tau,x_0)
\rightarrow
OMMPC rollout
\rightarrow
J_{\rm track}
$$

再训练一个小网络：

$$
g_\phi(\tau,x_0)
\approx
J_{\rm track}
$$

最终总评价：

$$
\boxed{
J=
J_{\rm explicit}
+
\lambda g_\phi(\tau,x_0)
}
$$

---

## 代表论文：Why Change Your Controller...

这篇非常接近你们。

它的思路就是：

> 控制器不动，让 planner 生成 controller 更容易跟的轨迹。

作者通过闭环仿真数据学习一个 tracking cost，然后把它作为 trajectory generation 的 regularizer。

实机 Crazyflie 实验中，某些情况下 tracking error 最多下降约 83%，并避免 aggressive maneuver 中 controller saturation。[arXiv](https://arxiv.org/abs/2401.04960?utm_source=chatgpt.com)

这篇和你未来的：

$$
\boxed{
J_{\rm OMMPC-trackability}
}
$$

关系最大。

---

## Quad-LCD 2025 更进一步

Quad-LCD 专门研究 actuator saturation。

它通过 simulation data 学习 tracking penalty：

$$
g_\phi(\tau)
$$

表示：

> 这条 trajectory 会不会把电机逼到 saturation，从而产生 uncontrolled drift。

然后把这个 penalty 用于 trajectory planning。

在 aggressive simulation 中，相比 baseline crash rate 大约降低 49%，并在 Crazyflie 做了实机验证。[arXiv](https://arxiv.org/abs/2505.10228?utm_source=chatgpt.com)

这对你们尤其值得看，因为你之前也想研究：

$$
OMMPC\rightarrow RPM
$$

所以未来很自然可以评价：

$$
\boxed{\text{这条轨迹对 actuator 到底有多难}}
$$

---

# 3.3 第三类：纯 learned score / ranking

就是：

$$
f_\phi(\tau,\text{environment})
\rightarrow score
$$

网络直接说：

$$
score_1=0.7,\quad
score_2=0.2,\quad
score_3=0.9
$$

于是选第三条。

优点：

- 表达力强；
- 能学习复杂高维因素。

缺点：

- 为什么选它不容易解释；
- distribution shift 风险大；
- 安全论证困难。

所以我之前说：

> 对你们“短、快、可飞”这种物理目标，没必要所有东西都黑盒化。

---

# 3.4 AeroDiffusion 就包含“生成 + selection”

AeroDiffusion 并不只是 diffusion 生成。

它后面还有：

$$
\boxed{\text{preference-guided batch selection}}
$$

把 diffusion 的多模态候选转成一条 executable safe trajectory。[DOI](https://doi.org/10.1109/LRA.2026.3728285?utm_source=chatgpt.com)

因此它同时跨：

$$
\boxed{第一部分 + 第三部分}
$$

这再次说明：

> 我们的四部分是**功能分解**，不是每篇论文一定恰好四个代码模块。

---

# 第四部分：评价完以后，怎么真正“训练”网络？

这个是整个 learning planner 的核心。

现在假设：

$$
\tau_\theta
=
f_\theta(o)
$$

网络生成一条轨迹。

评价器算：

$$
J(\tau_\theta)
$$

问题来了：

> **J 已经知道这次生成得很垃圾，然后呢？**

怎么修改：

$$
\theta
$$

？

目前主要有下面几种。

---

# 4.1 方法一：Imitation Learning——传统算法直接告诉网络正确答案

这是最好理解的。

先用：

$$
A^*+MINCO
$$

或者别的强 planner 算：

$$
\tau^*
$$

得到大量：

$$
(o,\tau^*)
$$

训练网络：

$$
f_\theta(o)\approx\tau^*
$$

loss：

$$
L=
\|\tau_\theta-\tau^*\|^2
$$

或者 waypoint loss 等。

也就是：

```text
传统Planner
    ↓
生成“标准答案”
    ↓
Network
    ↓
模仿
```

YOPO-Rally 2025 就是一个很直接的例子：它从 simulator 中获得 expert trajectories，然后用 behavior cloning 训练 planner，网络输入 depth image、current velocity、goal vector，输出多条 trajectory candidates 及其 costs。[arXiv](https://arxiv.org/abs/2505.18714?utm_source=chatgpt.com)

### 优点

简单、稳定。

### 缺点

网络上限容易受 teacher 限制。

因为：

$$
\boxed{\text{老师不会的，学生很难超过}}
$$

---

# 4.2 方法二：RL——把评价结果当 reward

这是你们原来说“RL 路径规划”最自然的形式。

假设评价：

$$
J=
J_{\rm collision}
+\lambda_1T
+\lambda_2L
+\lambda_3J_{\rm track}
$$

定义 reward：

$$
R=-J
$$

网络第一次：

```text
生成轨迹 A
↓
撞墙
↓
R=-100
```

网络第二次：

```text
生成轨迹 B
↓
成功但很慢
↓
R=20
```

第三次：

```text
生成轨迹 C
↓
又快又稳
↓
R=90
```

PPO/SAC 等 RL 算法不断修改：

$$
\theta
$$

让高 reward 的行为越来越常见。

所以：

$$
\boxed{
J_{\rm OMMPC-trackability}
}
$$

完全可以直接变成：

$$
R_{\rm track}
=
-J_{\rm track}
$$

进入第二部分 RL。

---

## RL 最大特点

它不要求：

$$
J
$$

可微。

哪怕评价过程是：

```text
跑Gazebo
↓
跑OMMPC
↓
飞机飞完
↓
统计最大误差
```

只要最后给个分数：

$$
R=53
$$

RL 就可以学。

所以对于复杂 OMMPC closed-loop evaluation：

$$
\boxed{\text{RL很好接}}
$$

但问题是：

- sample efficiency 低；
- 训练不稳定；
- reward 很难设计；
- credit assignment 长。

---

# 4.3 方法三：直接对 trajectory cost 求梯度

这个就是 **YOPO 的 Guidance Learning** 最值得你们理解的地方。

假设：

$$
\tau_\theta=f_\theta(o)
$$

然后 cost：

$$
J(\tau_\theta)
$$

如果这个 cost 对轨迹参数可微：

$$
\frac{\partial J}{\partial\tau}
$$

而轨迹又是网络输出：

$$
\frac{\partial\tau}{\partial\theta}
$$

那么：

$$
\boxed{
\frac{\partial J}{\partial\theta}
=
\frac{\partial J}{\partial\tau}
\frac{\partial\tau}{\partial\theta}
}
$$

直接 backprop。

---

## 直观理解

RL 只告诉网络：

> 你这次得了 35 分。

Guidance gradient 会进一步告诉：

> 你第 3 个 waypoint 往右移动一点，cost 会下降。

信息明显更丰富。

YOPO 训练时会利用 privileged ESDF 和 pose 等信息计算轨迹的 smoothness、safety、goal 等 cost 及数值梯度，再把这些梯度用于更新网络，而部署时不需要显式地图。[Amovlab](https://www.amovlab.top/blogs/news/tianjin-university-open-sources-an-end-to-end-planning-algorithm-for-smooth-autonomou?utm_source=chatgpt.com)

这就是：

$$
\boxed{\text{优化器的梯度被拿来教网络}}
$$

而不是传统优化：

$$
\text{梯度}\rightarrow\text{修改当前轨迹}
$$

现在变成：

$$
\text{梯度}\rightarrow\text{修改网络参数}
$$

这正是我们前面聊“传统算法被搬到训练阶段”的最典型例子。

---

# 4.4 方法四：Ranking / Preference Learning

假设不需要精确知道：

$$
J_A=14.728
$$

只知道：

$$
A>B
$$

即：

> A 比 B 好。

那也可以训练网络。

例如 evaluator 给出：

$$
\tau_A\succ\tau_B
$$

训练 scoring network：

$$
s_\phi(\tau_A)>s_\phi(\tau_B)
$$

最终学会排序。

这种方法特别适合：

- 多候选 diffusion；
- 人类 preference；
- 很难定义绝对 cost、但容易比较优劣的情况。

AeroDiffusion 的 preference-guided batch selection 就属于这类“多候选再偏好选择”的思路。[DOI](https://doi.org/10.1109/LRA.2026.3728285?utm_source=chatgpt.com)

---

# 4.5 方法五：Differentiable MPC / Differentiable Optimization

这是最复杂的。

普通优化器：

$$
z^*
=
\arg\min_zJ(z;\theta)
$$

你通常只能拿：

$$
z^*
$$

出来。

Differentiable optimizer 可以进一步得到：

$$
\frac{\partial z^*}{\partial\theta}
$$

所以梯度能够穿过：

```text
NN
 ↓
Optimizer / MPC
 ↓
trajectory/control
 ↓
loss
```

再：

```text
loss
 ↑
Optimizer
 ↑
NN
```

Actor-Critic MPC 就把 differentiable MPC 嵌进 actor-critic learning，用 MPC 负责短时域预测优化，用 RL 负责更长期的行为学习，并在真实无人机 racing 上验证到约 21 m/s。[arXiv](https://arxiv.org/abs/2306.09852?utm_source=chatgpt.com)

---

# Differentiable MPC 到底属于哪一部分？

它**不是简单属于第三部分“评价”**。

更准确：

$$
\boxed{\text{它是一种“优化模块 + 梯度传递机制”}}
$$

如果 MPC 用于把粗轨迹修成可行轨迹：

它属于：

$$
②+④
$$

如果 OMMPC 被用作闭环评价器，然后梯度能够穿过去：

它属于：

$$
③+④
$$

所以不要把具体算法强行塞到一个框里。

我们的四部分是在问四个**功能问题**。

---

# 五、把四部分组合起来，就得到完整训练流程

假设你们最终这么做：

### 输入

$$
o=
(\text{PointCloud},x,g)
$$

---

### Step 1：网络生成 K 条候选

$$
f_\theta(o)
\rightarrow
\{\tilde\tau_1,\ldots,\tilde\tau_K\}
$$

这些可能只是：

$$
waypoints
$$

或者 primitive 参数。

---

### Step 2：轨迹优化

每一条经过：

$$
MINCO / polynomial\ optimizer
$$

得到：

$$
\tau_1,\ldots,\tau_K
$$

满足基本：

- 平滑；
- collision-free；
- velocity；
- acceleration；
- 时间约束。

---

### Step 3：评价

对每条：

$$
J_i=
\alpha J_{\rm time}
+
\beta J_{\rm length}
+
\gamma J_{\rm collision}
+
\delta J_{\rm smooth}
+
\eta J_{\rm track}
$$

其中：

$$
J_{\rm track}
$$

来自你的 OMMPC。

例如：

$$
J_{\rm track}
=
w_1e_{\max}
+w_2e_{\rm RMSE}
+w_3t_{\rm sat}
+w_4J_u
$$

于是：

$$
J_1,J_2,\ldots,J_K
$$

---

### Step 4：反馈训练

这里你们选择一种机制。

#### 方案 A：RL

$$
R_i=-J_i
$$

用 PPO/SAC 更新 \(\theta\)。

---

#### 方案 B：Guidance Learning

如果：

$$
J
$$

可微：

$$
\nabla_\tau J
\rightarrow
\nabla_\theta J
$$

直接更新网络。

---

#### 方案 C：Preference

找：

$$
\tau_{\rm best}
$$

告诉网络：

$$
\tau_{\rm best}\succ\tau_j
$$

训练 ranking / generator。

---

#### 方案 D：混合

现实中其实很可能最合理：

$$
\boxed{
\text{Expert Pretraining}
\rightarrow
\text{Cost Guidance}
\rightarrow
\text{RL Fine-tuning}
}
$$

先让网络会基本规划，再进一步追求 closed-loop performance。

---

# 六、你负责的 OMMPC 到底怎么插进这个流程？

你现在的位置就非常清晰了。

## 最基础

部署时：

$$
\tau^*
\rightarrow
OMMPC
\rightarrow
UAV
$$

只做 follower。

---

## 再进一层

训练时：

$$
\tau_i
\rightarrow
OMMPC simulation
\rightarrow
e_{\rm track},saturation,\ldots
$$

给第三部分评价增加：

$$
J_{\rm track}
$$

---

## 再进一步

跑大量：

$$
(\tau,x)
\rightarrow
J_{\rm OMMPC}
$$

训练小 surrogate：

$$
g_\phi(\tau,x)
\approx
J_{\rm OMMPC}
$$

以后不需要每条训练轨迹都真的跑一次完整 OMMPC：

$$
\tau\rightarrow g_\phi\rightarrow\hat J_{\rm track}
$$

这正好对应 Why Change Your Controller 和 Quad-LCD 的思想。[arXiv](https://arxiv.org/abs/2401.04960?utm_source=chatgpt.com)

---

## 最激进

Differentiable OMMPC：

$$
NN
\rightarrow
trajectory
\rightarrow
OMMPC
\rightarrow
tracking\ result
\rightarrow
loss
$$

然后：

$$
\nabla loss
$$

直接穿过 OMMPC 回到网络。

理论上漂亮，但工程难度明显高很多。

所以我依然建议它放后期，而不是第一版。

---

# 七、几篇论文放进这四层以后就特别清楚了

| 论文 | ①生成 | ②优化 | ③评价 | ④训练反馈 |
|---|---|---|---|---|
| **EGO-Planner** | 搜索/初始化 | ✅ B-spline优化 | 显式 cost | 不训练网络 |
| **YOPO 2024** | ✅ primitives + NN | ✅ 网络/多项式整合 | 显式 trajectory cost | **cost gradient / Guidance Learning** |
| **Optimization-Embedded Networks 2025** | ✅ NN | **✅ embedded optimization** | dynamic feasibility | 梯度学习 |
| **Why Change Your Controller 2024** | 常规轨迹生成 | ✅ | **learned tracking cost** | 数据学 cost |
| **Quad-LCD 2025** | trajectory generator | ✅ | **actuator-aware learned penalty** | simulation data |
| **AeroDiffusion 2026** | **✅ diffusion多候选** | integrated/receding horizon | **preference selection** | diffusion learning / preference |
| **Actor-Critic MPC** | actor | **MPC** | critic/reward | **differentiable MPC + RL** |

这里最值得你注意的是：

**YOPO 几乎把 ①②③④ 全部揉到一个 learning framework 里了。**

这也是为什么你一开始觉得：

> “怎么有的算法好像第一第二部分一起做了？”

完全正确。

---

# 八、对你们项目，我现在会推荐什么样的第一版？

我不建议一下搞 LLM + diffusion + RL + OMMPC 全部一起。

最干净的第一版可以是：

```text
Point Cloud + State + Goal
           ↓
     Neural Generator
 motion primitive / waypoint
           ↓
          MINCO
           ↓
       K条候选轨迹
           ↓
        显式评价
  time + collision + length
           +
    OMMPC trackability
           ↓
        total cost
           ↓
       训练Generator
```

训练方法第一版甚至可以学 YOPO：

$$
\boxed{\text{尽量使用显式 cost gradient}}
$$

如果 OMMPC trackability 不可微，就：

$$
\boxed{
J_{\rm normal}
\text{ 用gradient}
+
J_{\rm track}
\text{ 用RL/learned surrogate}
}
$$

这反而可能成为你们非常有意思的一点：

$$
\boxed{
\text{Differentiable geometric cost}
+
\text{learned closed-loop trackability}
}
$$

---

# 九、最后给你一个“脑内模型”

以后你看到任何 learning-based trajectory planner，都可以拿四个问题拆它：

### ① 它怎么产生候选？

$$
\text{A*？Primitive？NN？Diffusion？LLM？}
$$

### ② 候选怎么满足动力学？

$$
\text{MINCO？B-spline？MPC？Network itself？}
$$

### ③ 什么叫好轨迹？

$$
\text{长度？时间？碰撞？控制可跟踪性？AI score？}
$$

### ④ 这个好坏怎么教回网络？

$$
\text{Imitation？RL？Gradient？Ranking？Differentiable optimization？}
$$

只要这四个问题你能回答，一篇学习式路径规划论文的主干基本就被你拆完了。

而对你们自己的论文，目前最值得深入的接口恰好是：

$$
\boxed{
③\ \text{OMMPC如何评价真实可跟踪性}
}
$$

以及

$$
\boxed{
④\ \text{这个可跟踪性怎么有效反馈给trajectory generator}
}
$$

这两件事正好把你负责的第三部分和第二部分的网络真正连起来，而不是“他们搞 RL，你在后面调 OMMPC”两边各玩各的。
