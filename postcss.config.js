export default {
  plugins: {
    'unwrap-standalone-tailwind-layers': {
      postcssPlugin: 'unwrap-standalone-tailwind-layers',
      Once(root) {
        const source = root.toString();
        if (source.includes('@tailwind')) return;

        root.walkAtRules('layer', (rule) => {
          if (!['base', 'components', 'utilities'].includes(rule.params)) return;
          rule.replaceWith(...rule.nodes);
        });
      },
    },
    tailwindcss: {},
    autoprefixer: {},
  },
}
