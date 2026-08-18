'use strict';

const assert = require('node:assert/strict');

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    setFromString(value) {
        this.values = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    add(...names) {
        names.forEach(name => this.values.add(name));
    }

    remove(...names) {
        names.forEach(name => this.values.delete(name));
    }

    contains(name) {
        return this.values.has(name);
    }

    toString() {
        return [...this.values].join(' ');
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.id = '';
        this.dataset = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.classList = new FakeClassList();
        this.children = [];
        this.parentNode = null;
        this.textContent = '';
        this.listeners = new Map();
    }

    set className(value) {
        this.classList.setFromString(value);
    }

    get className() {
        return this.classList.toString();
    }

    set innerHTML(value) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = [];
        this.textContent = value ? String(value) : '';
    }

    get innerHTML() {
        return this.textContent;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }

    click() {
        const listeners = this.listeners.get('click') || [];
        listeners.forEach(listener => listener({ target: this }));
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }

    closest(selector) {
        if (selector.startsWith('.') && this.classList.contains(selector.slice(1))) return this;
        return this.parentNode ? this.parentNode.closest(selector) : null;
    }

    querySelector(selector) {
        return findAll(this, selector)[0] || null;
    }

    querySelectorAll(selector) {
        return findAll(this, selector);
    }
}

function findAll(root, selector) {
    const matches = [];
    const className = selector.startsWith('.') ? selector.slice(1) : null;

    function visit(element) {
        element.children.forEach(child => {
            if (className && child.classList.contains(className)) matches.push(child);
            visit(child);
        });
    }

    visit(root);
    return matches;
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.head = new FakeElement('head');
        this.elementsById = new Map();
        this.operatorButtons = [];
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    register(element) {
        if (element.id) this.elementsById.set(element.id, element);
        this.body.appendChild(element);
        return element;
    }

    getElementById(id) {
        return this.elementsById.get(id) || null;
    }

    querySelectorAll(selector) {
        if (selector === '.operator-btn[data-operator]') return [...this.operatorButtons];
        if (selector === '.dealing-animation') return findAll(this.body, selector);
        return findAll(this.body, selector);
    }
}

function createElementWithId(document, id, className = '') {
    const element = new FakeElement('div');
    element.id = id;
    element.className = className;
    return document.register(element);
}

function createTestDocument() {
    const document = new FakeDocument();
    createElementWithId(document, 'cards-container', 'cards-container');
    createElementWithId(document, 'calculation-display', 'calculation-display');
    createElementWithId(document, 'message-container', 'message-container');
    createElementWithId(document, 'solved-count');
    createElementWithId(document, 'celebration', 'celebration');

    ['+', '-', '×', '÷'].forEach(operator => {
        const button = createElementWithId(document, `operator-${operator}`, 'operator-btn');
        button.dataset.operator = operator;
        document.operatorButtons.push(button);
    });

    createElementWithId(document, 'no-solution-btn', 'operator-btn no-solution-btn');
    createElementWithId(document, 'next-btn', 'action-btn');
    createElementWithId(document, 'reset-btn', 'action-btn');
    createElementWithId(document, 'solution-btn', 'action-btn');
    return document;
}

const nativeSetTimeout = global.setTimeout;
global.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 2), ...args);
global.document = createTestDocument();
global.window = global;

require('./game.js');

const debug = global.__gameDebug;
const cardsContainer = document.getElementById('cards-container');

function card(index) {
    return cardsContainer.children[index];
}

function operator(symbol) {
    return document.operatorButtons.find(button => button.dataset.operator === symbol);
}

function wait(milliseconds = 30) {
    return new Promise(resolve => nativeSetTimeout(resolve, milliseconds));
}

function positiveIntegerHas24Solution(values) {
    function greatestCommonDivisor(left, right) {
        let a = Math.abs(left);
        let b = Math.abs(right);
        while (b !== 0) [a, b] = [b, a % b];
        return a || 1;
    }

    function fraction(numerator, denominator = 1) {
        const sign = denominator < 0 ? -1 : 1;
        const divisor = greatestCommonDivisor(numerator, denominator);
        return {
            numerator: sign * numerator / divisor,
            denominator: Math.abs(denominator) / divisor
        };
    }

    function add(first, second) {
        return fraction(
            first.numerator * second.denominator + second.numerator * first.denominator,
            first.denominator * second.denominator
        );
    }

    function subtract(first, second) {
        return fraction(
            first.numerator * second.denominator - second.numerator * first.denominator,
            first.denominator * second.denominator
        );
    }

    function multiply(first, second) {
        return fraction(first.numerator * second.numerator, first.denominator * second.denominator);
    }

    function divide(first, second) {
        return fraction(first.numerator * second.denominator, first.denominator * second.numerator);
    }

    const failedStates = new Set();

    function search(items) {
        if (items.length === 1) {
            return items[0].numerator === 24 * items[0].denominator;
        }

        const stateKey = items
            .map(item => `${item.numerator}/${item.denominator}`)
            .sort()
            .join('|');
        if (failedStates.has(stateKey)) return false;

        for (let firstIndex = 0; firstIndex < items.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex++) {
                const first = items[firstIndex];
                const second = items[secondIndex];
                const remaining = items.filter((_, index) => index !== firstIndex && index !== secondIndex);
                const candidates = [add(first, second), multiply(first, second)];
                const forwardDifference = subtract(first, second);
                const reverseDifference = subtract(second, first);
                if (forwardDifference.numerator > 0) candidates.push(forwardDifference);
                if (reverseDifference.numerator > 0) candidates.push(reverseDifference);

                if (second.numerator !== 0) {
                    const forwardQuotient = divide(first, second);
                    if (forwardQuotient.denominator === 1 && forwardQuotient.numerator > 0) {
                        candidates.push(forwardQuotient);
                    }
                }
                if (first.numerator !== 0) {
                    const reverseQuotient = divide(second, first);
                    if (reverseQuotient.denominator === 1 && reverseQuotient.numerator > 0) {
                        candidates.push(reverseQuotient);
                    }
                }

                const uniqueCandidates = new Map(
                    candidates.map(candidate => [`${candidate.numerator}/${candidate.denominator}`, candidate])
                );
                for (const candidate of uniqueCandidates.values()) {
                    if (search([...remaining, candidate])) return true;
                }
            }
        }

        failedStates.add(stateKey);
        return false;
    }

    return search(values.map(value => fraction(value)));
}

function verifyEveryHandAgainstPositiveIntegerSolver() {
    let checkedHands = 0;

    for (let first = 1; first <= 13; first++) {
        for (let second = first; second <= 13; second++) {
            for (let third = second; third <= 13; third++) {
                for (let fourth = third; fourth <= 13; fourth++) {
                    const values = [first, second, third, fourth];
                    const cards = values.map((value, index) => ({
                        id: `verify-${index}`,
                        value,
                        isOriginal: true
                    }));
                    const solution = debug.find24Solution(cards);
                    const actual = Boolean(solution);
                    const expected = positiveIntegerHas24Solution(values);
                    assert.equal(actual, expected, `求解器误判：${values.join(',')}`);
                    if (solution) {
                        solution.forEach(step => {
                            assert.ok(Number.isInteger(step.result) && step.result > 0, `解法出现非正整数：${step.text}`);
                        });
                    }
                    checkedHands++;
                }
            }
        }
    }

    return checkedHands;
}

(async () => {
    const verifiedHands = verifyEveryHandAgainstPositiveIntegerSolver();
    assert.equal(verifiedHands, 1820, '应覆盖全部 1820 种无序牌面组合');

    const initialSuits = debug.setCardsForTest([2, 7, 3, 4]) && debug.getState().cards.map(item => item.suitIndex);
    document.getElementById('reset-btn').click();
    const resetSuits = debug.getState().cards.map(item => item.suitIndex);
    assert.deepEqual(resetSuits, initialSuits, '重置不应改变花色');

    debug.setCardsForTest([2, 7, 3, 4]);
    card(0).click();
    operator('+').click();
    operator('×').click();
    card(1).click();
    assert.deepEqual(
        debug.getState().calculationSteps,
        ['2 × 7 = 14'],
        '连续选择运算符只能执行最后一次选择'
    );

    debug.setCardsForTest([5, 7, 2, 1]);
    card(0).click();
    operator('+').click();
    card(1).click();
    card(1).click();
    operator('×').click();
    card(2).click();
    assert.deepEqual(
        debug.getState().calculationSteps,
        ['5 + 7 = 12', '12 × 2 = 24'],
        '中间结果 12 必须保持数字，不应变成 Q'
    );
    assert.equal(
        document.getElementById('calculation-display').textContent,
        '5 + 7 = 12 → 12 × 2 = 24',
        '计算区应保留完整步骤'
    );

    const fractionOnlyHand = debug.setCardsForTest([1, 3, 4, 6]);
    assert.equal(fractionOnlyHand, null, '1、3、4、6 只存在分数解法，本规则下应判定无解');

    debug.setCardsForTest([3, 2, 4, 6]);
    card(0).click();
    operator('÷').click();
    card(1).click();
    assert.deepEqual(debug.getState().calculationSteps, [], '不能整除的除法必须被拒绝');

    debug.setCardsForTest([3, 4, 6, 6]);
    card(0).click();
    operator('-').click();
    card(1).click();
    assert.deepEqual(debug.getState().calculationSteps, [], '负数减法必须被拒绝');

    debug.setCardsForTest([3, 3, 6, 6]);
    card(0).click();
    operator('-').click();
    card(1).click();
    assert.deepEqual(debug.getState().calculationSteps, [], '结果为 0 的减法必须被拒绝');

    const demoSolution = debug.setCardsForTest([2, 7, 3, 4]);
    assert.ok(demoSolution, '2、7、3、4 应存在正整数解法');
    assert.equal(demoSolution.length, 3, '四张牌的完整解法应有三步');

    const suitsBeforeDemo = debug.getState().cards.map(item => item.suitIndex);
    document.getElementById('solution-btn').click();
    await wait(100);
    let state = debug.getState();
    assert.equal(state.isAutoPlaying, false, '答案演示应能正常结束');
    assert.equal(state.calculationSteps.length, 3, '答案演示应执行三步');
    assert.equal(
        document.getElementById('calculation-display').textContent,
        state.calculationSteps.join(' → '),
        '答案演示文字必须与真实步骤一致'
    );
    assert.deepEqual(
        state.cards.map(item => item.suitIndex),
        suitsBeforeDemo,
        '查看答案不应改变花色'
    );

    const solvedBeforeNoSolution = state.solvedCount;
    const noSolution = debug.setCardsForTest([1, 3, 4, 6]);
    assert.equal(noSolution, null, '仅能通过分数求解的牌组应判定为无解');
    document.getElementById('no-solution-btn').click();
    state = debug.getState();
    assert.equal(state.solvedCount, solvedBeforeNoSolution + 1, '正确判断无解应计入已解决');

    document.getElementById('next-btn').click();
    document.getElementById('next-btn').click();
    document.getElementById('next-btn').click();
    assert.equal(document.querySelectorAll('.dealing-animation').length, 1, '快速切题只能保留一个发牌动画');
    await wait(40);
    assert.equal(cardsContainer.children.length, 4, '发牌结束应显示四张牌');

    const styleCountBefore = document.head.children.length;
    debug.setCardsForTest([6, 6, 6, 6]);
    card(0).click();
    operator('+').click();
    card(1).click();
    card(2).click();
    operator('+').click();
    card(3).click();
    card(1).click();
    operator('+').click();
    card(3).click();
    assert.equal(document.head.children.length, styleCountBefore, '庆祝动画不应不断添加 style 标签');

    console.log(`PASS: all regression tests completed; ${verifiedHands} hands matched the positive-integer solver`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
