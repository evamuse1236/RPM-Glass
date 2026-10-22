export const fields = state => ({title: state.title, ...whenFields(state)});
