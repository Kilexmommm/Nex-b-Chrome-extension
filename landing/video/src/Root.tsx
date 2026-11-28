import React from 'react';
import {Composition} from 'remotion';
import {Tour, TOTAL} from './Tour';

export const Root: React.FC = () => (
  <>
    <Composition id="Tour-EN" component={Tour} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{lang: 'en' as const}} />
    <Composition id="Tour-ES" component={Tour} durationInFrames={TOTAL} fps={30} width={1920} height={1080} defaultProps={{lang: 'es' as const}} />
  </>
);
