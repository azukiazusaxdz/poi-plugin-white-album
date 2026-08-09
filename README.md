# poi-plugin-white-album

飞机熟练度计数器【你为什么这么熟练？你到底刷过多少次啊！】

跟踪 **第一舰队** 与 **陆航**（活动 / 中部 / 南西）编入飞机的刷熟练度进度。

## 功能

- 按装备实例显示 `当前战斗次数 / 目标战斗次数`
- 目标为显示熟练度 `>>`（内部熟练度约 100）
- 分母按 [舰载机熟練度 wiki](https://wikiwiki.jp/kancolle/%E8%89%A6%E8%BC%89%E6%A9%9F%E7%86%9F%E7%B7%B4%E5%BA%A6) 机种档位上限
- 战斗结算时乐观计数；回母港 / 陆航刷新时用 `api_alv` 校正
- 陆航：集中同点 +2，分散按点 +1，防空 +1；舰侦 / 水侦 / 大型飞行艇不计
- 演习不加计数
- 未收录机种显示 `??/??`

## 安装

poi 插件中心安装，或将本包放到 `plugins/node_modules/poi-plugin-white-album` 后启用。

## 数据

进度保存在 `{APPDATA}/aircraft-proficiency/state.json`。
