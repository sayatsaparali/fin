export type UiToastVariant = 'error' | 'success' | 'info';

type UiToastDetail = {
  message: string;
  variant?: UiToastVariant;
};

export const pushUiToast = (message: string, variant: UiToastVariant = 'error') => {
  if (typeof window === 'undefined') return;
  const safeMessage = String(message ?? '').trim();
  if (!safeMessage) return;

  window.dispatchEvent(
    new CustomEvent<UiToastDetail>('finhub:toast', {
      detail: { message: safeMessage, variant }
    })
  );
};

