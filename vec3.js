function cross(a, b) {
    return [ a[1] * b[2] - a[2] * b[1],
             a[2] * b[0] - a[0] * b[2],
             a[0] * b[1] - a[1] * b[0] ]
}
function normalize(a) {
    var len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    return [ a[0] / len, a[1] / len, a[2] / len ]
}
function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function sub(a, b) {
    return [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ]
}
function add(a, b) {
    return [ a[0] + b[0], a[1] + b[1], a[2] + b[2] ]
}
function scale(a, s) {
    return [ a[0] * s, a[1] * s, a[2] * s ]
}
function length(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
}