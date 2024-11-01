import { ReactNode } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'r-if': {
        condition: boolean;
        children: ReactNode;
      };
    }
  }
}
