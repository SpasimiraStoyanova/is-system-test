
const fs = require('fs');

let bom = [
    {'ID Родител': 'Пл. 6 отв.', 'ID Компонент': 'Плътно тяло', 'Количество': '1'}
];
let routesData = [
    {'Код на детайла': 'Пл. 6 отв.', 'Име на операция': 'Фрезоване 1', '№ Операция': '10'},
    {'Код на детайла': 'Пл. 6 отв.', 'Име на операция': 'Измиване', '№ Операция': '20'},
    {'Код на детайла': 'Пл. 6 отв.', 'Име на операция': 'Боядисване', '№ Операция': '30'}
];
let allOtcheti = [
    {'ID Детайл': 'Пл. 6 отв.', 'Операция': 'Измиване', 'Количество': '1', 'Статус': 'Отчетено', 'Оператор': 'СИСТЕМА (Ръчно добавен)'},
    {'ID Детайл': 'Пл. 6 отв.', 'Операция': 'Боядисване', 'Количество': '1', 'Статус': 'Отчетено', 'Оператор': 'Пешо'}
];

// Replicate analyze_node.html EXACTLY
let routesByDetail = {};
routesData.forEach(r => {
    let code = String(r['Код на детайла']).trim().toLowerCase();
    if(!routesByDetail[code]) routesByDetail[code] = [];
    routesByDetail[code].push(r);
});

let completedOps = {};
let grossCompletedOps = {};

allOtcheti.forEach(r => {
    let code = String(r['ID Детайл']).trim().toLowerCase();
    let op = String(r['Операция']).trim().toLowerCase();
    let qty = parseFloat(r['Количество']) || 0;
    let key = code + '_' + op;
    if(r['Статус'] === 'Отчетено') {
        completedOps[key] = (completedOps[key] || 0) + qty;
        if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) { 
            grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
        }
    }
});

Object.keys(routesByDetail).forEach(code => {
    let routes = routesByDetail[code];
    for (let i = routes.length - 2; i >= 0; i--) {
        let opKey = code + '_' + String(routes[i]['Име на операция']).trim().toLowerCase();
        let nextOpKey = code + '_' + String(routes[i+1]['Име на операция']).trim().toLowerCase();
        grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, grossCompletedOps[nextOpKey] || 0);
        completedOps[opKey] = Math.max(completedOps[opKey] || 0, completedOps[nextOpKey] || 0);
    }
});

console.log('completedOps:', completedOps);
console.log('grossCompletedOps:', grossCompletedOps);
