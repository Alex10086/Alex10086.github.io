---
title: 路径规划框架补充
date: 2026-10-17 13:37:47
description: 同样与gpt对话得到，用于补充前面文章
tags: []
categories: []
---
大多数**可以用这个框架去“拆解理解”**，但不能说所有论文都严格按照这四个独立模块实现。

你前面总结的：

$$
\boxed{ 1.\ 生成候选 \rightarrow 2.\ 优化/可行化 \rightarrow 3.\ 评价 \rightarrow 4.\ 训练反馈 }
$$

其实更像一个**功能分析框架**，特别适合学习式路径规划论文。

关键是：论文里这四件事可能被揉在一起，甚至某一部分根本不存在。

比如传统 A\*：

$$
\text{扩展节点} \rightarrow \text{用 }g+h\text{ 评价} \rightarrow \text{继续扩展}
$$

这里“生成候选”和“评价候选”是交替进行的，根本不是先生成完再统一打分。

而且它没有第 4 步：

$$
\boxed{\text{没有训练网络}}
$$

所以用你的框架看：

- ① 有；
- ② 可能没有或很弱；
- ③ 有；
- ④ 无。

---

RRT\* 也类似：
```
随机采样
↓
生成新节点/路径
↓
碰撞检查 + cost
↓
rewire
↓
继续采样
```

它也是：

$$
①+③
$$

不断循环。

RRT\* 自己的 rewiring 又有点像：

$$
②\text{优化}
$$

所以三部分是交织的。

---

## 对 trajectory optimization 论文

例如 MINCO / EGO-Planner。

可能一开始有一条粗路径，然后：

$$
\tau^\* = \arg\min\_\tau J(\tau)
$$

这里：

$$
②\text{优化}
$$

和：

$$
③\text{评价}
$$

实际上几乎就是**同一件事情**。

因为所谓优化，就是：

> 不断根据 cost 修改轨迹。

例如：

$$
J= J\_{\rm collision} + J\_{\rm smooth} + J\_{\rm time}
$$

计算：

$$
\nabla\_\tau J
$$

然后：

$$
\tau\leftarrow\tau-\eta\nabla\_\tau J
$$

所以你没法特别机械地说：

> “这里是第二模块，那里是第三模块。”

更准确是：

$$
\boxed{\text{②利用③提供的评价来优化轨迹}}
$$

---

# MPC 更明显

MPC：

$$
U^\* = \arg\min_U J(X,U)
$$

它同时在：

- 生成未来控制/轨迹；
- 根据动力学优化；
- 根据 cost 评价。

所以：

$$
\boxed{①+②+③}
$$

几乎全部塞进一个在线优化问题里了。

这也是为什么我之前说：

> 这个框架是“功能划分”，不是“代码模块划分”。

---

# YOPO 这种学习论文则几乎四个都有

可以很好地按照你的框架拆。

### ① 生成

Motion primitives + NN 生成候选轨迹。

### ② 可行化

通过轨迹参数化/动力学结构得到平滑 trajectory。

### ③ 评价

trajectory cost：

$$
J\_{\rm safety} + J\_{\rm smooth} + J\_{\rm goal}
$$

### ④ 训练

$$
\frac{\partial J}{\partial\tau} \rightarrow \frac{\partial J}{\partial\theta}
$$

直接更新网络。

所以 YOPO 是你这个四层框架特别好的教材。

---

# Diffusion planner 也很好套

例如：

### ①

Diffusion 从条件分布：

$$
p\_\theta(\tau|o)
$$

采样很多：

$$
\tau_1,\ldots,\tau_K
$$

### ②

可能再进行约束投影、优化、smooth。

### ③

给每条算：

$$
J(\tau_i)
$$

或 preference score。

### ④

训练 diffusion model / preference model。

非常标准。

---

# 但是端到端 RL 会有点“不像”

例如：

$$
o_t \rightarrow \pi\_\theta \rightarrow a_t
$$

连续执行以后自然形成 trajectory。

这里甚至没有明确的：

$$
\boxed{\text{候选轨迹}}
$$

你只能把它抽象成：

### ①

policy 的 rollout 隐式生成轨迹。

### ②

环境动力学决定 trajectory。

### ③

reward 评价 rollout。

### ④

RL 更新 policy。

也就是说仍然能套，但第一、第二部分都变成了**隐式过程**。

---

# 还有一类很重要：POMDP / uncertainty planning

这种论文评价的不只是：

$$
\text{路径短不短}
$$

还会考虑：

$$
\text{信息增益}
$$

比如：

> 往左走距离更短，但传感器什么都看不见；

> 往右走稍长，但能看到更多未知区域。

评价可能变成：

$$
J= J\_{\rm motion} -\lambda I(\text{future observation})
$$

这种也可以塞进第 ③：

$$
\boxed{\text{评价的不只是运动质量，还有信息价值}}
$$

所以框架仍然成立，只是评价维度扩展了。

---

# 我会稍微修改你们这套框架，让它更通用

不要固定叫：

> 粗轨迹 → 优化轨迹 → 评价 → 训练。

而是记成四个问题：

### ① Proposal / Search

$$
\boxed{\text{解空间里哪些方案值得考虑？}}
$$

可以是：

- 搜索节点；
- trajectory；
- control sequence；
- waypoint；
- neural samples。

---

### ② Feasibility / Refinement

$$
\boxed{\text{怎么让方案满足实际约束、变得更好？}}
$$

包括：

- 动力学；
- 平滑；
- 时间参数；
- actuator constraints；
- 优化。

---

### ③ Objective / Evaluation

$$
\boxed{\text{什么才叫“好”？}}
$$

包括：

- 距离；
- 时间；
- 碰撞；
- 能耗；
- 平滑；
- 风险；
- trackability；
- uncertainty；
- information gain。

---

### ④ Adaptation / Learning

$$
\boxed{\text{上一次规划的经验能不能让下一次规划更聪明？}}
$$

只有 learning 方法才明显存在。

包括：

- imitation；
- RL；
- gradient guidance；
- ranking；
- differentiable optimization。

这样几乎任何路径规划论文都能拿来问这四个问题。

---

## 对传统方法来说，第④通常就是“No”

例如：

$$
A^\*
$$

你问：

> 它怎么根据昨天的 1000 个地图自动改善今天的搜索策略？

通常答案：

> 不会。

除非是 learned heuristic A\* 一类。

于是：

$$
①②③\text{有}
$$$$
④\text{没有}
$$

---

## 对学习方法来说，第④通常恰恰是最大区别

比如：

$$
\text{环境}\rightarrow NN\rightarrow\tau
$$

训练一次以后：

$$
\theta
$$

变好了。

这种“跨任务/跨场景积累经验”的能力，就是网络和传统在线规划最大的区别之一。

---

所以以后你看一篇论文，我特别建议你别先被算法名吓到。

直接拿这四个问题问它：

> **1. 它的候选解从哪来？**

> **2. 怎么保证这些候选真的可飞？**

> **3. 它认为什么样的轨迹最好？**

> **4. 这些评价会不会让它以后变得更会规划？怎么回传？**

比如一篇论文再花里胡哨，只要你能回答这四个问题，它的主体逻辑基本就被你拆出来了。

而且对你们现在这个课题，我会尤其把**第③+④**盯紧，因为①②已经有 A\*/MINCO/YOPO/Diffusion 等大量成熟方案；你们比较容易形成自己特色的地方，反而可能是：

$$
\boxed{\text{怎么定义“真正可飞的好轨迹”}}
$$

以及：

$$
\boxed{\text{怎么让这个评价有效教会网络生成更好的轨迹}}
$$

这正好还能跟你的 OMMPC 部分连接起来。
