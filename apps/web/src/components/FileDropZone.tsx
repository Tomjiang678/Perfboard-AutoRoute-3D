import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";

interface FileDropZoneProps {
  title: string;
  accept: string;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function FileDropZone({ title, accept, onFiles }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onFiles(files);
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onFiles(files);
    }
    event.target.value = "";
  }

  return (
    <div
      className={isDragging ? "drop-zone dragging" : "drop-zone"}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} className="file-input" type="file" accept={accept} multiple onChange={handleInput} />
      <div className="drop-icon">
        <FileText size={20} />
      </div>
      <div className="drop-copy">
        <strong>{title}</strong>
        <span>拖入文件或点击选择</span>
      </div>
      <Upload size={16} className="drop-upload" />
    </div>
  );
}
