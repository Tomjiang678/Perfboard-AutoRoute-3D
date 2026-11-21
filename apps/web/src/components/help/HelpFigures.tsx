/** Simple vector walkthroughs for the help dialog (no external images). */
export function ExportReportsFigure() {
  return (
    <svg viewBox="0 0 560 190" role="img" aria-label="Multisim 导出网表与交叉引用报告">
      <rect x="1" y="1" width="330" height="188" rx="8" className="help-figure-panel" />
      <rect x="1" y="1" width="330" height="26" rx="8" className="help-figure-bar" />
      <text x="12" y="18" className="help-figure-text">Multisim</text>
      <text x="12" y="48" className="help-figure-text">Simulate</text>
      <rect x="90" y="32" width="110" height="24" rx="4" className="help-figure-active" />
      <text x="98" y="48" className="help-figure-text">Reports</text>
      <rect x="200" y="56" width="128" height="58" rx="5" className="help-figure-panel" />
      <rect x="200" y="56" width="128" height="20" rx="5" className="help-figure-active" />
      <text x="208" y="70" className="help-figure-text">Netlist Report</text>
      <text x="208" y="92" className="help-figure-text">Cross Reference</text>
      <path d="M330 85 H365" className="help-figure-arrow" />
      <rect x="375" y="34" width="170" height="46" rx="6" className="help-figure-file" />
      <text x="386" y="53" className="help-figure-text">网表.txt</text>
      <text x="386" y="70" className="help-figure-muted">Netlist Report</text>
      <rect x="375" y="104" width="170" height="46" rx="6" className="help-figure-file" />
      <text x="386" y="123" className="help-figure-text">交叉引用.txt</text>
      <text x="386" y="140" className="help-figure-muted">Cross Reference Report</text>
    </svg>
  );
}

export function ImportFilesFigure() {
  return (
    <svg viewBox="0 0 560 190" role="img" aria-label="把两个报告一起拖进 Import 区域">
      <rect x="1" y="1" width="170" height="188" rx="8" className="help-figure-panel" />
      <text x="12" y="22" className="help-figure-text">Import</text>
      <rect x="14" y="36" width="144" height="82" rx="8" className="help-figure-drop" />
      <text x="86" y="66" textAnchor="middle" className="help-figure-text">拖入文件</text>
      <text x="86" y="86" textAnchor="middle" className="help-figure-muted">.txt / .net</text>
      <rect x="14" y="132" width="144" height="22" rx="4" className="help-figure-file" />
      <text x="20" y="147" className="help-figure-muted">网表.txt</text>
      <rect x="14" y="158" width="144" height="22" rx="4" className="help-figure-file" />
      <text x="20" y="173" className="help-figure-muted">交叉引用.txt</text>
      <path d="M190 96 H250" className="help-figure-arrow" />
      <rect x="262" y="32" width="286" height="126" rx="8" className="help-figure-panel" />
      <text x="276" y="54" className="help-figure-text">Import Result</text>
      <text x="276" y="80" className="help-figure-muted">Parts 18</text>
      <text x="276" y="102" className="help-figure-muted">Nets 18</text>
      <text x="276" y="124" className="help-figure-muted">Unsupported 1</text>
      <rect x="276" y="136" width="256" height="12" rx="6" className="help-figure-progress" />
    </svg>
  );
}

export function MappingCardFigure() {
  return (
    <svg viewBox="0 0 560 210" role="img" aria-label="Multisim parts 映射工作台">
      <rect x="1" y="1" width="558" height="208" rx="8" className="help-figure-panel" />
      <text x="16" y="24" className="help-figure-text">Multisim parts</text>
      <text x="470" y="24" className="help-figure-muted">U3, U6</text>
      <text x="16" y="54" className="help-figure-text">LM324D · CASE751A · 14</text>
      <text x="16" y="82" className="help-figure-muted">1OUT</text>
      <rect x="64" y="68" width="46" height="20" rx="4" className="help-figure-input" />
      <text x="76" y="83" className="help-figure-text">1</text>
      <text x="130" y="82" className="help-figure-muted">1IN-</text>
      <rect x="178" y="68" width="46" height="20" rx="4" className="help-figure-input" />
      <text x="190" y="83" className="help-figure-text">2</text>
      <text x="244" y="82" className="help-figure-muted">VS+</text>
      <rect x="286" y="68" width="46" height="20" rx="4" className="help-figure-input" />
      <text x="298" y="83" className="help-figure-text">4</text>
      <text x="352" y="82" className="help-figure-muted">VS-</text>
      <rect x="394" y="68" width="46" height="20" rx="4" className="help-figure-input" />
      <text x="406" y="83" className="help-figure-text">11</text>
      <text x="16" y="118" className="help-figure-muted">Spare pins</text>
      <rect x="16" y="128" width="72" height="22" rx="4" className="help-figure-input" />
      <text x="24" y="143" className="help-figure-muted">7  ▾</text>
      <rect x="96" y="128" width="72" height="22" rx="4" className="help-figure-input" />
      <text x="104" y="143" className="help-figure-muted">0 (GND) ▾</text>
      <rect x="380" y="170" width="70" height="26" rx="5" className="help-figure-button" />
      <text x="400" y="187" className="help-figure-button-text">Save</text>
      <text x="16" y="186" className="help-figure-muted">脚数 · 逻辑脚 → 物理脚 · 空闲脚接已有网络</text>
    </svg>
  );
}

export function LibraryTabsFigure() {
  return (
    <svg viewBox="0 0 560 170" role="img" aria-label="Multisim 映射规则库的公用与用户标签">
      <rect x="1" y="1" width="558" height="168" rx="8" className="help-figure-panel" />
      <text x="16" y="24" className="help-figure-text">Multisim 映射规则库</text>
      <rect x="16" y="38" width="58" height="24" rx="5" className="help-figure-input" />
      <text x="28" y="55" className="help-figure-muted">公用</text>
      <rect x="82" y="38" width="58" height="24" rx="5" className="help-figure-active" />
      <text x="94" y="55" className="help-figure-text">用户</text>
      <rect x="16" y="76" width="526" height="26" rx="5" className="help-figure-file" />
      <text x="24" y="94" className="help-figure-text">LM324D</text>
      <text x="450" y="94" className="help-figure-muted">CASE751A · 14p</text>
      <rect x="16" y="108" width="526" height="40" rx="5" className="help-figure-input" />
      <text x="24" y="126" className="help-figure-muted">A:1OUT → 1   A:1IN- → 2   A:1IN+ → 3   VS+ → 4</text>
      <text x="24" y="142" className="help-figure-muted">…   VS- → 11   D:4OUT → 14</text>
    </svg>
  );
}
