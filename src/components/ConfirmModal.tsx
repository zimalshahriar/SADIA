import React from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
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
}: ConfirmModalProps) {
  if (!open) return null;
  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:opacity-90"
      : "bg-black text-white hover:opacity-90";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white/80 backdrop-blur p-5 card-shadow"
      >
        <div className="mb-2 text-lg font-semibold">{title}</div>
        {description && (
          <div className="mb-4 text-sm text-gray-700">{description}</div>
        )}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
