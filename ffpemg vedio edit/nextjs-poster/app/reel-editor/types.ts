export type AspectRatio = '9:16' | '1:1' | '16:9';
export type OverlayPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
export type OverlaySize = 'small' | 'medium' | 'large';

export interface ReelEditorState {
  clip1Url: string;
  clip2Url: string;
  audioUrl: string;
  imageUrl: string;
  aspectRatio: AspectRatio;
  overlayPosition: OverlayPosition;
  overlaySize: OverlaySize;
}
