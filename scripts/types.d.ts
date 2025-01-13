import { ReactNode } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'r-if': {
        condition: boolean;
        children: ReactNode;
      };
    }
    interface IntrinsicElements {
      'r-else': {
        condition: boolean;
        children: ReactNode;
      };
    }
    interface IntrinsicElements {
      'r-show': {
        condition: boolean;
        children: ReactNode;
      };
    }
  }
}
