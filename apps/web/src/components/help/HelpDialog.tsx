import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogDrag } from "../useDialogDrag.ts";
import {
  ExportReportsFigure,
  ImportFilesFigure,
  LibraryTabsFigure,
  MappingCardFigure
} from "./HelpFigures.tsx";

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const drag = useDialogDrag();

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        ref={drag.ref}
        style={{ transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)` }}
      >
        <div
          className="dialog-header draggable"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        >
          <h2 id="help-title">帮助</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="help-body">
          <h2 className="help-heading">从 Multisim 导入元件</h2>
          <p className="help-lead">
            整个流程分四步：导出两份报告 → 拖进项目 → 补全不认识的型号 → 生成元件并放置。
            两份报告缺一不可：网表提供连接关系，交叉引用提供型号和封装。
          </p>

          <HelpStep
            index={1}
            title="在 Multisim 里导出两份报告"
          >
            <p>
              打开要导出的原理图，从菜单 <b>Simulate → Reports</b>（中文版为「仿真 → 报告」）分别导出：
            </p>
            <ul>
              <li><b>Netlist Report</b>：网表报告，保存为 <code>.txt</code>；</li>
              <li><b>Cross Reference Report</b>：交叉引用报告，保存为 <code>.txt</code>。</li>
            </ul>
            <div className="help-figure"><ExportReportsFigure /></div>
            <p className="help-muted">
              两份报告必须来自同一张原理图。不要用 SPICE Netlist，也不需要用 BOM。
              不同版本的 Multisim 菜单文字可能略有差异，认准这两个报告名称即可。
            </p>
          </HelpStep>

          <HelpStep index={2} title="拖进 ProtoRoute">
            <p>
              在 ProtoRoute 里 <b>Project → New</b> 新建工程，然后把两个 <code>.txt</code>
              <b>一起</b>拖进左侧的 Import 区域（也可以点开选择两个文件）。
            </p>
            <div className="help-figure"><ImportFilesFigure /></div>
            <p>
              如果分两次拖：第一次会提示「缺少交叉引用」或「缺少网表」，这是正常的；
              拖入第二份后提示会自动消失。推荐一次选中两个文件。
            </p>
          </HelpStep>

          <HelpStep index={3} title="补全不认识的型号">
            <p>
              识别不了的型号会出现在左侧 <b>Multisim parts</b>，工作台会自动弹出。
              一个型号一张卡片，<code>U3</code>、<code>U6</code> 这种同型号会共用一次配置。
            </p>
            <div className="help-figure"><MappingCardFigure /></div>
            <ul>
              <li><b>Pin count</b>：这颗器件物理上有几个脚，按封装确认；</li>
              <li><b>逻辑脚 → 物理脚</b>：按数据手册把 Multisim 的脚名填上真实脚号；</li>
              <li><b>电源脚合并</b>：<code>VS+</code>、<code>VS-</code>、<code>VCC</code>、<code>GND</code> 这类只出现一次，四个单元共用；</li>
              <li><b>空闲脚</b>：没有逻辑名的脚，可以选择「不接」，或接到网表里已有的网络（如 <code>0 (GND)</code>、<code>VCC</code>）；</li>
              <li>填完点 <b>Save</b>。没填完时 Save 是灰的；点 <b>Skip</b> 会保留在待补清单里，暂不放置。</li>
            </ul>
            <p>
              以常见的四运放 LM324 为例：<code>1OUT=1</code>、<code>1IN-=2</code>、<code>1IN+=3</code>、
              <code>VS+=4</code>、<code>2IN+=5</code>……<code>VS-=11</code>、<code>4OUT=14</code>。
              填错脚号不会报错，但布线会连错，所以以数据手册为准。
            </p>
            <p className="help-muted">
              保存后配置写进当前工程，同时进入本机的 Multisim 映射规则库（用户）；刷新页面不需要重填。
              没点 Save 的输入也会作为草稿保留，重新打开卡片会恢复。
            </p>
          </HelpStep>

          <HelpStep index={4} title="生成元件、放置和布线">
            <p>
              补全后点工具栏的 <b>生成元件</b>（快捷键 <kbd>G</kbd>），
              元件会按网表生成到板上；再用 <b>自动放置</b>（<kbd>P</kbd>）和
              <b>自动布线</b>（<kbd>A</kbd>）。
            </p>
            <ul>
              <li>只补了脚数、没补映射的型号不会生成，左侧仍会显示待补；保存完整映射后会自动补生成。</li>
              <li>映射不完整的型号即使生成了，相关网络也会在 DRC 里报「缺少物理脚映射」；</li>
              <li>改动脚数会重建该元件并清掉它的走线，程序会先确认。</li>
            </ul>
          </HelpStep>

          <h2 className="help-heading">保存位置与库</h2>
          <div className="help-figure"><LibraryTabsFigure /></div>
          <ul>
            <li><b>库 → 封装库</b>：元件外形与脚位封装目录；</li>
            <li><b>库 → Multisim 映射规则库 → 公用</b>：随安装包发布的型号规则，只读；</li>
            <li><b>库 → Multisim 映射规则库 → 用户</b>：你保存过的型号，可以展开看映射、点 × 删除；</li>
            <li><b>侧栏 Pin profiles</b>：只属于当前工程的配置，随工程 JSON 一起导出；</li>
            <li>工程的自动保存、用户库位置可以在 <b>Settings</b> 里查看和调整。</li>
          </ul>

          <h2 className="help-heading">常见问题</h2>
          <dl className="help-faq">
            <dt>提示「缺少交叉引用报告」或「缺少网表报告」</dt>
            <dd>只导入了其中一份。把另一份也拖进来即可，旧提示会自动清掉。</dd>

            <dt>导入了两个文件，但元件数量不对</dt>
            <dd>
              先看左侧 Network 数量是否为 0；再确认两份报告来自同一张原理图。
              电源符号（<code>V1</code>、<code>V2</code>、<code>VCC</code>、<code>0</code>）会被当作网络，不会生成元件。
            </dd>

            <dt>电源脚没有接，会怎样</dt>
            <dd>只占孔、不参与布线。可以在工作台里把它挂到已有网络，或留空；留空时实物可能不工作。</dd>

            <dt>刷新后还要重新填吗</dt>
            <dd>
              不需要。点过 Save 的型号写在工程和映射规则库里；没点 Save 的输入会作为草稿恢复。
              如果仍然出现空卡片，确认保存时 Save 不是灰的，并等左上角工程自动保存完成。
            </dd>

            <dt>怎么删掉一个用户型号</dt>
            <dd>库 → Multisim 映射规则库 → 用户 → 点该行右侧的 ×。会删除当前工程里的同名配置和本机用户库记录；网表里的这个器件会回到待补。</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}

function HelpStep({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <section className="help-step">
      <div className="help-step-number">{index}</div>
      <div className="help-step-body">
        <h3>{title}</h3>
        {children}
      </div>
    </section>
  );
}
