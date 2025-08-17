import React from "react";
import ReactDOM from "react-dom";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  showConfirm?: boolean;
  showCancel?: boolean;
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
  showConfirm = true,
  showCancel = true,
}: ConfirmModalProps) {
  if (!open) return null;
  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:opacity-90"
      : "btn-primary";
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4 sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-soft bg-card backdrop-blur p-4 sm:p-5 card-shadow max-h-[80vh] overflow-auto"
      >
        <div className="mb-2 text-lg font-semibold">{title}</div>
        {description && (
          <div className="mb-4 text-sm text-muted">{description}</div>
        )}
        <div className="flex justify-end gap-2">
          {showCancel && (
            <button
              className="rounded-lg border border-soft bg-card px-3 py-1.5 text-sm hover:bg-gray-100"
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          {showConfirm && (
            <button
              className={`rounded-lg px-3 py-1.5 text-sm ${confirmClass}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
