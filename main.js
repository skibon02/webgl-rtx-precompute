let gl;

function lockError(e){
    console.log('pointer lock failed');
}

function sfc32(a, b, c, d) {
    return function() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
      var t = (a + b) | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      d = d + 1 | 0;
      t = t + d | 0;
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}
function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}
function vec3ToLin(vec, sz) {
    return vec[0] + vec[1] * sz[0] + vec[2] * sz[0] * sz[1];
}

//encode block_material, sample xyz, sample rotation
function pack5_16(vec) {
    let sz = 16;
    return (vec[0] + 1) + vec[1] * sz + vec[2] * sz * sz + vec[3] * sz * sz * sz + (vec[4] + 3) * sz * sz * sz * sz;
}

var saveByteArray = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    return function (data, name) {
        var blob = new Blob(data, {type: "octet/stream"}),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = name;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());


// GEN MAP
let map_blocks_dims = [15, 15, 15];
let map_blocks = new Array(map_blocks_dims[0] * map_blocks_dims[1] * map_blocks_dims[2]);
map_blocks.fill(-1);
let map_prefix = "incredible_";
let map_seed = cyrb128(map_prefix + "map1");
let rand = sfc32(map_seed[0], map_seed[1], map_seed[2], map_seed[3]);

for(let i = 1; i < map_blocks_dims[0]-1; i++) {
    for(let j = 1; j < map_blocks_dims[1]-1; j++) {
        for(let k = 1; k < map_blocks_dims[2]-1; k++) {
            if(rand() < 0.12) {
                if(rand() < 0.5) {
                    map_blocks[vec3ToLin([i,j,k], map_blocks_dims)] = 1;
                } else {
                    map_blocks[vec3ToLin([i,j,k], map_blocks_dims)] = 0;
                }
            }
            
        }
    }
}


let sharedResources = {};

class Prog {
    constructor(name) {
        this.name = name;
        this.init = false;
        this.clearEnabled = true;
    }

    getAdjacentBlock(vec) {
        let lin = vec3ToLin(vec, map_blocks_dims);
        if(lin < 0 || lin >= this.blocks.length) {
            return -1;
        }
        return this.blocks[lin];
    }
    createShader( type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }

        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }
    createProgram( vertexShader, fragmentShader) {
        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }

        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }

    u_(loc) {
        return gl.getUniformLocation(this.program, "u_" + loc);
    }
    async initProgram() {
        var vertexShader = this.createShader(gl.VERTEX_SHADER, await fetch("shaders/" + this.name + "_vert.glsl").then(r=> r.text()));
        var fragmentShader = this.createShader(gl.FRAGMENT_SHADER, await fetch("shaders/" + this.name + "_frag.glsl").then(r=> r.text()));
        this.program = this.createProgram(vertexShader, fragmentShader);
        this.vao = gl.createVertexArray();

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        this.bgQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuad);
        let positions = [
            -1.0,  1.0,
            1.0,  1.0,
            -1.0, -1.0,
            -1.0, -1.0,
            1.0,  1.0,
            1.0, -1.0,
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(gl.getAttribLocation(this.program, "a_position"));
        gl.vertexAttribPointer(gl.getAttribLocation(this.program, "a_position"), 2, gl.FLOAT, true, 0, 0);
        this.init = true;
    }

    prepareDraw() {
        if(!this.init) {
            throw new Error("Graphics not initialized");
        }
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        if(this.clearEnabled) {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }
    setTextureContent(data) {
    }

    postDraw() {

    }
    resize() {
    }
}

//real time renderer
class RTR extends Prog {
    constructor() {
        super("game");
        this.precompMapping = [];
    }

    async initProgram() {
        await super.initProgram();
        gl.uniform2f(this.u_("resolution"), gl.canvas.width, gl.canvas.height);
        
        this.blocks = map_blocks;


        //generate side to sample mapping
        this.samplesLength = 40;
        let sampleCounter = 0;
        loop1:
        for(let k = 1; k < map_blocks_dims[0]-1; k++) {
            for(let j = 1; j < map_blocks_dims[1]-1; j++) {
                for(let i = 1; i < map_blocks_dims[2]-1; i++) {
                    let material = this.blocks[vec3ToLin([i,j,k], map_blocks_dims)];
                    if(material != -1) {
                        if(this.getAdjacentBlock([i-1, j, k]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 0] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i+1, j, k]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 1] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j-1, k]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 2] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j+1, k]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 3] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k-1]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 4] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k+1]) == -1) {
                            this.precompMapping[vec3ToLin([i, j, k], map_blocks_dims) + 4096 * 5] = sampleCounter; 
                            sampleCounter++;
                        }

                        if(sampleCounter >= this.samplesLength*this.samplesLength) {
                            break loop1;
                        }
                    }
                }
            }
        }

        const alignment = 1;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);

        this.precompMapping[4096*6 + 4096-1 + 1] = 0;
        this.precompMappingData = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.precompMappingData);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, 4096, 6, 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.precompMapping));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        //set textures
        //shared:
        gl.uniform1i(this.u_("precompTex"), 2);
        gl.uniform1i(this.u_("blocksData"), 4);
        //local:
        gl.uniform1i(this.u_("precompMappingData"), 3);

        //set scene data
        gl.uniform1i(this.u_("precompUsed"), 0);
        gl.uniform3iv(this.u_("sceneSize"), map_blocks_dims);

        //set scene materials
        gl.uniform1fv(this.u_("materials[0].albedoFactor"), new Float32Array([0.8]));
        gl.uniform3fv(this.u_("materials[0].albedo"), new Float32Array([0.4, 0.8, 0.8]));
        gl.uniform1f(this.u_("materials[1].reflectivity"), 0.4);
        gl.uniform1fv(this.u_("materials[1].albedoFactor"), new Float32Array([0.8]));
        gl.uniform3fv(this.u_("materials[1].albedo"), new Float32Array([0.8, 0.2, 0.8]));
        gl.uniform1f(this.u_("materials[1].reflectivity"), 0.4);
    }
    rtxON() {
        gl.uniform1i(this.u_("precompUsed"), 1);
    }
    rtxOFF() {
        gl.uniform1i(this.u_("precompUsed"), 0);
    }

    setTextureContent(data) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, sharedResources.precompTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, 4096, 0, gl.RGBA, gl.FLOAT, data);
        this.rtxON();
    }

    resize() {
        gl.uniform2f(this.u_("resolution"), gl.canvas.width, gl.canvas.height);
    }

    prepareDraw(seed, cameraPos, cameraVec) {
        super.prepareDraw();
        
        gl.uniform1f(this.u_("seed"), seed);
        gl.uniform3f(this.u_("cameraPos"), cameraPos[0], cameraPos[1], cameraPos[2]);
        gl.uniform3f(this.u_("cameraVec"), cameraVec[0], cameraVec[1], cameraVec[2]);
    }
}

class Precomputer extends Prog {
    constructor() {
        super("precomputer");
        this.clearEnabled = false;
        this.samplesLength = 40;
        this.samplesPacked = new Array(4020);
        this.presentProg = new Prog("present");
    }
    

    async initProgram() {

        await super.initProgram();
        gl.uniform2f(this.u_("resolution"), 4096, 4096);
        
        this.blocks = map_blocks;
        for(let i = 0; i < map_blocks_dims[0] * map_blocks_dims[1] * map_blocks_dims[2]; i++) {
            this.samplesPacked[i] = pack5_16([this.blocks[i], 0, 0, 0, -3], map_blocks_dims[0]);
        }

        let sampleCounter = 0;
        loop1:
        for(let k = 1; k < map_blocks_dims[0]-1; k++) {
            for(let j = 1; j < map_blocks_dims[1]-1; j++) {
                for(let i = 1; i < map_blocks_dims[2]-1; i++) {
                    let material = this.blocks[vec3ToLin([i,j,k], map_blocks_dims)];
                    if(material != -1) {
                        if(this.getAdjacentBlock([i-1, j, k]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, -1]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i+1, j, k]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, 1]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j-1, k]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, -2]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j+1, k]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, 2]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k-1]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, -3]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k+1]) == -1) {
                            this.samplesPacked[sampleCounter] += pack5_16([-1, i,j,k, 3]);
                            sampleCounter++;
                        }

                        if(sampleCounter >= this.samplesLength*this.samplesLength) {
                            break loop1;
                        }
                    }
                }
            }
        }
        // debugger;
        
        //pack this.samplesPacked to int texture
        this.dataTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, this.samplesPacked.length, 1, 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.samplesPacked));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        //create framebuffer
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sharedResources.precompTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);



        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);


        //set scene data
        gl.uniform1i(this.u_("sampleCount"), sampleCounter);
        gl.uniform3iv(this.u_("sceneSize"), map_blocks_dims);

        //textures
        //shared resources:
        gl.uniform1i(this.u_("blocksData"), 4);

        //local resources:
        gl.uniform1i(this.u_("packedDataTex"), 1);


        //set scene materials
        gl.uniform1fv(this.u_("materials[0].albedoFactor"), new Float32Array([0.8]));
        gl.uniform3fv(this.u_("materials[0].albedo"), new Float32Array([0.4, 0.8, 0.8]));
        gl.uniform1f(this.u_("materials[1].reflectivity"), 0.4);
        gl.uniform1fv(this.u_("materials[1].albedoFactor"), new Float32Array([0.8]));
        gl.uniform3fv(this.u_("materials[1].albedo"), new Float32Array([0.8, 0.2, 0.8]));
        gl.uniform1f(this.u_("materials[1].reflectivity"), 0.4);

        // INIT PRESENT SUBPROGRAM
        await this.presentProg.initProgram();
        gl.uniform2f(this.presentProg.u_("resolution"), 1920, 1080);
        gl.uniform1i(this.presentProg.u_("texture"), 2);
        gl.uniform1f(this.presentProg.u_("texSize"), 4096);

    }

    setTextureContent(float32Data) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, sharedResources.precompTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, 4096, 0, gl.RGBA, gl.FLOAT, float32Data);
    }

    getTextureContent() {
        //get data from framebuffer;
        let data = new Float32Array(4096*4096*4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.readPixels(0, 0, 4096, 4096, gl.RGBA, gl.FLOAT, data);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return data;
        

        // var data = new Uint8Array(4096 * 4096 * 4);
        // gl.readPixels(0, 0, 4096, 4096, gl.RGBA, gl.UNSIGNED_BYTE, data);
        // return data;
    }
    prepareDraw(seed, cameraPos, cameraVec) {

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, 4096, 4096);
        super.prepareDraw();
        
        gl.uniform1f(this.u_("seed"), seed);
        gl.uniform3f(this.u_("cameraPos"), cameraPos[0], cameraPos[1], cameraPos[2]);
        gl.uniform3f(this.u_("cameraVec"), cameraVec[0], cameraVec[1], cameraVec[2]);
    }
    postDraw() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        this.presentProg.prepareDraw();

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    resize() {
        // gl.uniform2f(this.u_("resolution"), gl.canvas.width, gl.canvas.height);
    }
}
    


class App {
    constructor() {
        this.programs = [];
        this.currentProgram = 0;

        this.cameraPos = [5.5, 2.5, -2.5];
        this.cameraVec = [1, 0, 0];
        //angle of camera
        this.camera = [0, 0];
        this.move = [0, 0, 0];
        
        this.moveSpeed = 2;
        this.rotateSenstivity = 0.001;

        this.initGraphics();
    }
    async initGraphics() {

        //BIND HANDLERS
        let canvas = document.querySelector("#c");
        this.keydownHandler = this.keydown.bind(this);
        this.keyupHandler = this.keyup.bind(this);
        this.pointerlockchangeHandler = this.pointerlockchange.bind(this);
        this.clickHandler = this.click.bind(this);
        this.filedropHandler = this.filedrop.bind(this);
        this.dragoverHandler = this.dragover.bind(this);

        canvas.addEventListener("drop", this.filedropHandler);
        canvas.addEventListener("dragover", this.dragoverHandler);
        window.addEventListener('keydown',this.keydownHandler,false);
        window.addEventListener('keyup',this.keyupHandler,false);
        document.addEventListener('pointerlockchange', this.pointerlockchangeHandler, false);
        document.addEventListener('pointerlockerror', lockError, false);
        canvas.addEventListener('click', this.clickHandler, false);

        //ENABLE WEBGL
        gl = canvas.getContext("webgl2");
        // get required extensions for luminance textures
        if (!gl.getExtension('EXT_color_buffer_float')) {
            return alert('need EXT_color_buffer_float');
        }
        if (!gl.getExtension('OES_texture_float_linear')) {
            return alert('need OES_texture_float_linear');
        }
        if (!gl.getExtension('EXT_float_blend')) {
            return alert('need EXT_float_blend');
        }

        if (!gl) {
            return alert('No webGL :(');
        }
        
        //INIT shared resources
        // unit2: precomputed texture
        sharedResources.precompTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, sharedResources.precompTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4096, 4096, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // unit4: blocks data texture
        sharedResources.blocksDataTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_3D, sharedResources.blocksDataTex);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32I, map_blocks_dims[0], map_blocks_dims[1], map_blocks_dims[2], 0, gl.RED_INTEGER, gl.INT, new Int32Array(map_blocks));
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        //INIT PROGRAMS
        let baking_prog = new Precomputer();
        let editor_prog = new RTR();

        await baking_prog.initProgram();
        await editor_prog.initProgram();
        
        this.programs.push(editor_prog);
        this.programs.push(baking_prog);
        
        gl.viewport(0, 0, canvas.width, canvas.height);

        this.resizeObserver = new ResizeObserver(this.resizeCanvasToDisplaySize.bind(this));
        this.resizeObserver.observe(canvas);
        this.resizeCanvasToDisplaySize([{target: canvas}]);
        //start rendering cycle
        window.requestAnimationFrame(this.draw.bind(this));
    }
    dragover(e) {
        e.preventDefault();
    }
    filedrop(e) {
        e.preventDefault();
        e.stopPropagation();
        let file = e.dataTransfer.files[0];
        let reader = new FileReader();
        reader.onload = (e) => {
            let data = e.target.result;
            let float32Data = new Float32Array(data);
            this.programs[this.currentProgram].setTextureContent(float32Data);
        }
        reader.readAsArrayBuffer(file);
    }
    keyup(e){
        if(e.repeat) return;
        if(e.key == "d"){
            this.move[0] = 0;
        }
        if(e.key == "a"){
            this.move[0] = 0;
        }
        if(e.key == "w"){
            this.move[2] = 0;
        }
        if(e.key == "s"){
            this.move[2] = 0;
        }
        if(e.key == " "){
            this.move[1] = 0;
        }
        if(e.key == "Shift"){
            this.move[1] = 0;
        }
    }
    keydown(e){
        if(e.repeat) return;
        if(e.key == "d"){
            this.move[0] = 1;
        }
        if(e.key == "a"){
            this.move[0] = -1;
        }
        if(e.key == "w"){
            this.move[2] = -1;
        }
        if(e.key == "s"){
            this.move[2] = 1;
        }
        if(e.key == " "){
            this.move[1] = 1;
        }
        if(e.key == "Shift"){
            this.move[1] = -1;
        }
        if(e.key == "p") {
            if(this.currentProgram == 1) {
                let program = this.programs[1];
                program.wannaSwitch = false;
                let textureContent = program.getTextureContent();
                //save binary data
                saveByteArray([textureContent], 'baked.skb');
            }
        }
        if(e.key == "1") {
            this.currentProgram = 0;
        }
        if(e.key == "2") {
            this.currentProgram = 1;
        }
        if(e.key == "o") {
            let program = this.programs[0];
            program.rtxON();
        }
        if(e.key == "i") {
            let program = this.programs[0];
            program.rtxOFF();
        }

    }

    pointerlockchange(e) {
        if (document.pointerLockElement === gl.canvas) {
            this.mousemoveHandler = this.mousemove.bind(this);
            document.addEventListener("mousemove", this.mousemoveHandler, false);
            console.log('locked');
        } else {
            document.removeEventListener("mousemove", this.mousemoveHandler, false);
            console.log('released');
        }
    }
    click() {
        if(document.pointerLockElement != gl.canvas)
            gl.canvas.requestPointerLock();
    }
    mousemove(e) {
        this.camera[0] += e.movementX * this.rotateSenstivity;
        this.camera[1] -= e.movementY * this.rotateSenstivity;
        if(this.camera[1] > Math.PI/2) this.camera[1] = Math.PI/2;
        if(this.camera[1] < -Math.PI/2) this.camera[1] = -Math.PI/2;

        this.cameraVec[0] = Math.cos(this.camera[0]) * Math.cos(this.camera[1]);
        this.cameraVec[1] = Math.sin(this.camera[1]);
        this.cameraVec[2] = Math.sin(this.camera[0]) * Math.cos(this.camera[1]);
    }
    resizeCanvasToDisplaySize(entries) {
        if(this.stopped)
            return;

        for(let entry of entries) {
            let canvas = entry.target;
            // Lookup the size the browser is displaying the canvas in CSS pixels.
            const dpr = window.devicePixelRatio;
            const displayWidth  = Math.round(canvas.clientWidth * dpr);
            const displayHeight = Math.round(canvas.clientHeight * dpr);

            // Check if the canvas is not the same size.
            const needResize = canvas.width  !== displayWidth || 
                                canvas.height !== displayHeight;

            if (needResize) {
                // Make the canvas the same size

                canvas.width  = displayWidth;
                canvas.height = displayHeight;
                gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
                this.notifyResize();
            }
        }
    }
    notifyResize() {
        this.programs[this.currentProgram].resize();
        // console.log('resized');
    }
    draw(timestamp) {  
        if(this.stopped) {
            return;
        }
        if(!this.lastTimestamp)
            this.lastTimestamp = timestamp;

        //update
        let delta = (timestamp - this.lastTimestamp) / 1000 * this.moveSpeed;
        let top = [0.0, 1.0, 0.0];
        let right = normalize(cross(this.cameraVec, top));
        let forward = normalize(cross(right, top));
        let move = [0, 0, 0];
        for(let i = 0; i < 3; i++) {
            move[i] = this.move[0] * right[i] + this.move[1] * top[i] + this.move[2] * forward[i];
            this.cameraPos[i] += move[i] * delta;
        }

        //draw
        let program = this.programs[this.currentProgram];

        let seed = Math.random()*timestamp * 1.623426 % 1;
        program.prepareDraw(seed, this.cameraPos, this.cameraVec);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        program.postDraw();

        // setTimeout(() => {
        window.requestAnimationFrame(this.draw.bind(this));
        this.lastTimestamp = timestamp;
        // }, 60);
    }

    cleanup() {
        this.stopped = true;
        this.resizeObserver.disconnect();

        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);

        // this.gl.deleteTexture(this.bgtexture);
        // this.gl.deleteBuffer(this.vertexBuffer);

        // this.gl.deleteProgram(this.program);
        // this.gl.deleteVertexArray(this.vao);
        //this.gl.deleteVertexArray(this.anime_vao);

    }

}

let app = new App();