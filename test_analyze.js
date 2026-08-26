
const routes = [{op: 'Фрезоване'}, {op: 'Измиване'}, {op: 'Боядисване'}];
let completedOps = {
    'Фрезоване': 0,
    'Измиване': 1, // Ръчно добавен 1 бр
    'Боядисване': 1 // Отчетен на терминал 1 бр
};
for (let i = routes.length - 2; i >= 0; i--) {
    let opKey = routes[i].op;
    let nextOpKey = routes[i+1].op;
    completedOps[opKey] = Math.max(completedOps[opKey] || 0, completedOps[nextOpKey] || 0);
}
console.log('Final state:', completedOps);
