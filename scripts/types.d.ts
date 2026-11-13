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
    interface IntrinsicElements {
      'r-for': {
        expression: string;
        children: ReactNode;
      };
    }
  }
}

declare module 'react' {
  interface Attributes {
    'r-if'?: boolean;
    'r-else'?: boolean;
    'r-show'?: boolean;
    /** Vue-like list rendering, e.g. r-for="(item, index) in items" */
    'r-for'?: string;
  }
}
