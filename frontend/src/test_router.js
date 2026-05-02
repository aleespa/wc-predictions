
function patternToRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withParams = escaped.replace(/:(\w+)/g, '([^/]+)');
    return new RegExp(`^${withParams}$`);
}

const routes = {
    '/': 'home',
    '/login': 'login',
    '/predict/:id': 'predict'
};

const path = '/predict/73';
let handler = routes[path];

if (!handler) {
    for (const [pattern, h] of Object.entries(routes)) {
        const regex = patternToRegex(pattern);
        console.log(`Pattern: ${pattern}, Regex: ${regex}`);
        const match = path.match(regex);
        if (match) {
            handler = h;
            console.log(`Matched! Params: ${match.slice(1)}`);
            break;
        }
    }
}

console.log(`Final handler: ${handler}`);
