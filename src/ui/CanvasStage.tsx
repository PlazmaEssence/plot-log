import { useEffect, useRef } from 'preact/hooks';
import { Stage } from './Stage';

export interface CanvasStageProps {
  onReady?: (stage: Stage) => void;
}

export function CanvasStage({ onReady }: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const stage = new Stage(canvasRef.current);
    onReady?.(stage);
    return () => stage.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} class="stage-canvas" />;
}
