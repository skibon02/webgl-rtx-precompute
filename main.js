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


class Material {
    constructor(albedoFactor = 0.8, albedo = [1.0, 1.0, 1.0], reflectivity = 0.0, emission = [0.0, 0.0, 0.0], isGlass = false) {
        this.albedoFactor = albedoFactor;
        this.albedo = albedo;
        this.reflectivity = reflectivity;
        this.emission = emission;
        this.isGlass = isGlass;
    }
}
class GlassMaterial extends Material {
    constructor(albedofactor = 0.8, albedo = [1.0, 1.0, 1.0]) {
        super(albedofactor, albedo);
        this.isGlass = true;
    }
}


let defaultMap = {
    blocks_dims: [16, 16, 16],
    blocks: [],
    // staticLights: [
    //     {
    //         position: [7, 4, -2],
    //         power: [13000.0, 13000.0, 13000.0],
    //         radius: 1.0
    //     },
    //     {
    //         position: [7, 15.4, -2],
    //         power: [3000.0, 13000.0, 13000.0],
    //         radius: 1.0
    //     },
    //     {
    //         position: [-2, 4.4, 9],
    //         power: [13000.0, 3000.0, 13000.0],
    //         radius: 1.0
    //     },
    //     {
    //         position: [7, 6.4, 17],
    //         power: [13000.0, 13000.0, 3000.0],
    //         radius: 1.0
    //     },
    //     {
    //         position: [5, 9, 5],
    //         power: [23000.0, 23000.0, 23000.0],
    //         radius: 1.0
    //     },
    //     {
    //         position: [8.5, 2.8, 5.5],
    //         power: [150000.0, 10000.0, 50000.0],
    //         radius: 0.3
    //     }
    // ],
    // fakeLights: [
    //     [13, 9, -3]
    // ],
    
    // materials: [
    //     new Material(0.8, [0.4, 0.8, 0.8]),
    //     new Material(0.8, [0.8, 0.2, 0.8], 0.0),
    //     new GlassMaterial(0.9),
    //     new Material(0.8, [0.8, 0.8, 0.8]),
    // ],
    // spheres: [
    //     {
    //         position: [5.0, 5.0, 5.0],
    //         radius: 1.0,
    //         material: new GlassMaterial(0.9)
    //     },
    //     {
    //         position: [7.3, 2.5, 3.5],
    //         radius: 0.49,
    //         material: new Material(0.6, [1.0, 0.6, 0.8], 0.0, [1.0, 1.0, 1.0])
    //     }
    // ],
    // dynamicSpheres: [
    //     {
    //         position: [5.5, 2.5, 1.5],
    //         radius: 0.5,
    //         material: new GlassMaterial(0.9)
    //     },
    //     {
    //         position: [7.5, 2.5, 1.5],
    //         radius: 0.5,
    //         material: new Material(0.6, [1.0, 0.6, 0.3], 0.8, [1.0, 1.0, 1.0])
    //     }
    // ],
    // dynamicCubes: [
    //     {
    //         pos1: [5.5, 2.5, 1.5],
    //         pos2: [6.5, 3.5, 2.5],
    //         material: new Material(0.9, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0])
    //     }
    // ]
    fakeLights: [
        [6, 6, 4]
    ],
    
    materials: [
        new Material(0.8, [0.4, 0.8, 0.8]),
        new Material(0.8, [0.8, 0.2, 0.8], 0.4),
        new GlassMaterial(0.9),
        new Material(0.8, [0.8, 0.8, 0.8]),
    ],
    staticLights: [
        {
            position: [6, 8, 4],
            power: [10000.0, 32000.0, 40000.0],
            radius: 1.0
        },
        {
            position: [9, 12, 12],
            power: [40000.0, 12000.0, 10000.0],
            radius: 1.0
        },
        {
            position: [9.5, 7.5, 5],
            power: [300000.0, 12000.0, 150000.0],
            radius: 0.3
        }
    ],
    dynamicSpheres: [
        {
            position: [2, 4, 12],
            radius: 0.4,
            material: new Material(0.6, [1.0, 0.6, 0.8], 0.0, [1.0, 1.0, 1.0]),
            t: 0.0,
            
            activationRadius: 8.0,
            hp: 4,
            mob: 0,
            type: 0, //0 - mob, 1 - projectile
        },
        {
            position: [12, 4, 12],
            radius: 0.4,
            material: new Material(0.6, [0.2, 0.6, 0.8], 0.0, [1.0, 1.0, 1.0]),
            t: 0.0,
            activationRadius: 5.0,
            hp: 10,
            mob: 1, //0 - shootinng mob, 1 - moving mob
            type: 0, //0 - mob, 1 - projectile
            speed: 3,
        }
    ],
    spheres: [
        {
            position: [9.5, 5.5, 5],
            radius: 0.8,
            material: new GlassMaterial(0.9)
        },
    ],
    dynamicCubes: [
        {
            pos1: [12.31, 1.31, 12.31],
            pos2: [12.69, 1.69, 12.69],
            material: new Material(0.9, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0]),
            set: false,
            t: 0.0
        },
        {
            pos1: [6, 1, 6],
            pos2: [5, 2, 7],
            material: new Material(0.9, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0]),
            set: false,
            t: 0.0
        },
        {
            pos1: [1, 1, 4],
            pos2: [2, 2, 5],
            material: new Material(0.9, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0]),
            set: false,
            t: 0.0
        },
        {
            pos1: [9, 1, 10],
            pos2: [8, 2, 11],
            material: new Material(0.9, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0]),
            set: false,
            t: 0.0
        }
    ],
    name: "map1"
}
defaultMap.blocks = new Array(defaultMap.blocks_dims[0] * defaultMap.blocks_dims[1] * defaultMap.blocks_dims[2])
defaultMap.blocks.fill(-1);

class Map {
    constructor() {
        this.importMap(defaultMap);

        this.prefix = "incredible_";
        this.seed = cyrb128(this.prefix + "map1");
        let rand = sfc32(this.seed[0], this.seed[1], this.seed[2], this.seed[3]);

        //set map borders to material 0:
        for(let x = 0; x < this.blocks_dims[0]; x++) {
            for(let y = 0; y < this.blocks_dims[1]; y++) {
                for(let z = 0; z < this.blocks_dims[2]; z++) {
                    if(x == 0 || x == this.blocks_dims[0] - 1 || y == 0 || y == this.blocks_dims[1] - 1 || z == 0 || z == this.blocks_dims[2] - 1) {
                        this.blocks[vec3ToLin([x,y,z], this.blocks_dims)] = 0;
                    }
                }
            }
        }
    }
    importMap(map) {
        for(let key in map) {
            this[key] = map[key];
        }
    }
    export() {
        let map = {};
        for(let key in this) {
            if(key == "prefix" || key == "seed") continue;
            map[key] = this[key];
        }
        return JSON.stringify(map);
    }
    setMaterialUniform(prog, loc, material) {
        gl.uniform1f(prog.u_(loc + ".reflectivity"), material.reflectivity);
        gl.uniform1f(prog.u_(loc + ".albedoFactor"), material.albedoFactor);
        gl.uniform3fv(prog.u_(loc + ".albedo"), material.albedo);
        gl.uniform3fv(prog.u_(loc + ".emission"), material.emission);
        gl.uniform1i(prog.u_(loc + ".isGlass"), material.isGlass);
    }
    setUniforms(prog, onlyStatic = false) {
        gl.useProgram(prog.program);
        gl.uniform1i(prog.u_("numStaticLights"), this.staticLights.length);
        for(let i = 0; i < this.staticLights.length; i++) {
            gl.uniform3fv(prog.u_("staticLights[" + i + "].position"), this.staticLights[i].position);
            gl.uniform3fv(prog.u_("staticLights[" + i + "].power"), this.staticLights[i].power);
            gl.uniform1f(prog.u_("staticLights[" + i + "].radius"), this.staticLights[i].radius);
        }
        if(!onlyStatic) {
            gl.uniform1i(prog.u_("numFakePointLights"), this.fakeLights.length);
            for(let i = 0; i < this.fakeLights.length; i++) {
                gl.uniform3fv(prog.u_("fakePointLights[" + i + "].position"), this.fakeLights[i]);
            }

            gl.uniform1i(prog.u_("numDynamicSpheres"), this.dynamicSpheres.length);
            for(let i = 0; i < this.dynamicSpheres.length; i++) {
                gl.uniform3fv(prog.u_("dynamicSpheres[" + i + "].center"), this.dynamicSpheres[i].position);
                gl.uniform1f(prog.u_("dynamicSpheres[" + i + "].radius"), this.dynamicSpheres[i].radius);
                this.setMaterialUniform(prog, "dynamicSpheres[" + i + "].material", this.dynamicSpheres[i].material);
            }
            
            gl.uniform1i(prog.u_("numDynamicCubes"), this.dynamicCubes.length);
            for(let i = 0; i < this.dynamicCubes.length; i++) {
                gl.uniform3fv(prog.u_("dynamicCubes[" + i + "].min"), this.dynamicCubes[i].pos1);
                gl.uniform3fv(prog.u_("dynamicCubes[" + i + "].max"), this.dynamicCubes[i].pos2);
                this.setMaterialUniform(prog, "dynamicCubes[" + i + "].material", this.dynamicCubes[i].material);
            }
        }

        gl.uniform1i(prog.u_("numSpheres"), this.spheres.length);
        for(let i = 0; i < this.spheres.length; i++) {
            gl.uniform3fv(prog.u_("spheres[" + i + "].center"), this.spheres[i].position);
            gl.uniform1f(prog.u_("spheres[" + i + "].radius"), this.spheres[i].radius);
            this.setMaterialUniform(prog, "spheres[" + i + "].material", this.spheres[i].material);
        }

        for(let i = 0; i < this.materials.length; i++) {
            this.setMaterialUniform(prog, "materials[" + i + "]", this.materials[i]);
        }
    }
    setBlock(x,y,z, block) {
        this.blocks[vec3ToLin([x,y,z], this.blocks_dims)] = block;
        this.blocksDirty = true;
    }
    updateBlocks() {
        if(!this.blocksDirty) {
            return;
        }
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_3D, sharedResources.blocksDataTex);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32I, this.blocks_dims[0], this.blocks_dims[1], this.blocks_dims[2], 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.blocks));
        app.programs[0].genMapping();
        app.programs[1].genMapping();
        this.blocksDirty = false;
    }
}

let map = new Map();

let sharedResources = {};

class Prog {
    constructor(name) {
        this.name = name;
        this.init = false;
        this.clearEnabled = true;
    }

    getAdjacentBlock(vec) {
        let lin = vec3ToLin(vec, map.blocks_dims);
        if(lin < 0 || lin >= map.blocks.length) {
            return -1;
        }
        return map.blocks[lin];
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

    genMapping() {
        this.samplesLength = 64;
        let sampleCounter = 0;
        loop1:
        for(let k = 0; k < map.blocks_dims[0]; k++) {
            for(let j = 0; j < map.blocks_dims[1]; j++) {
                for(let i = 0; i < map.blocks_dims[2]; i++) {
                    let material = map.blocks[vec3ToLin([i,j,k], map.blocks_dims)];
                    if(material != -1) {
                        if(this.getAdjacentBlock([i-1, j, k]) == -1 || this.getAdjacentBlock([i-1, j, k]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 0] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i+1, j, k]) == -1 || this.getAdjacentBlock([i+1, j, k]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 1] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j-1, k]) == -1 || this.getAdjacentBlock([i, j-1, k]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 2] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j+1, k]) == -1 || this.getAdjacentBlock([i, j+1, k]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 3] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k-1]) == -1 || this.getAdjacentBlock([i, j, k-1]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 4] = sampleCounter; 
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k+1]) == -1 || this.getAdjacentBlock([i, j, k+1]) == 2) {
                            this.precompMapping[vec3ToLin([i, j, k], map.blocks_dims) + 4096 * 5] = sampleCounter; 
                            sampleCounter++;
                        }

                        if(sampleCounter >= this.samplesLength*this.samplesLength) {
                            break loop1;
                        }
                    }
                }
            }
        }
        console.log(sampleCounter);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.precompMappingData);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, 4096, 6, 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.precompMapping));
    }

    async initProgram() {
        await super.initProgram();
        gl.uniform2f(this.u_("resolution"), gl.canvas.width, gl.canvas.height);


        //generate side to sample mapping

        const alignment = 1;
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);

        this.precompMapping[4096*6 + 4096-1 + 1] = 0;
        this.precompMappingData = gl.createTexture();
        this.genMapping();
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
        gl.uniform3iv(this.u_("sceneSize"), map.blocks_dims);
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
        this.samplesLength = 64;
        this.samplesPacked = new Array(8000);
        this.presentProg = new Prog("present");
        this.frames = 0;
    }
    
    genMapping() {
        let sampleCounter = 0;
        loop1:
        for(let k = 0; k < map.blocks_dims[0]; k++) {
            for(let j = 0; j < map.blocks_dims[1]; j++) {
                for(let i = 0; i < map.blocks_dims[2]; i++) {
                    let material = map.blocks[vec3ToLin([i,j,k], map.blocks_dims)];
                    if(material != -1) {
                        if(this.getAdjacentBlock([i-1, j, k]) == -1 || this.getAdjacentBlock([i-1, j, k]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, -1]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i+1, j, k]) == -1 || this.getAdjacentBlock([i+1, j, k]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, 1]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j-1, k]) == -1 || this.getAdjacentBlock([i, j-1, k]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, -2]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j+1, k]) == -1 || this.getAdjacentBlock([i, j+1, k]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, 2]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k-1]) == -1 || this.getAdjacentBlock([i, j, k-1]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, -3]);
                            sampleCounter++;
                        }
                        if(this.getAdjacentBlock([i, j, k+1]) == -1 || this.getAdjacentBlock([i, j, k+1]) == 2) {
                            this.samplesPacked[sampleCounter] = pack5_16([-1, i,j,k, 3]);
                            sampleCounter++;
                        }

                        if(sampleCounter >= this.samplesLength*this.samplesLength) {
                            break loop1;
                        }
                    }
                }
            }
        }
        console.log(sampleCounter);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, this.samplesPacked.length, 1, 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.samplesPacked));
    
        gl.useProgram(this.program);
        gl.uniform1i(this.u_("sampleCount"), sampleCounter);
    }

    async initProgram() {

        await super.initProgram();
        gl.uniform2f(this.u_("resolution"), 4096, 4096);

        
        //pack this.samplesPacked to int texture
        this.dataTexture = gl.createTexture();
        this.genMapping();
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
        gl.uniform3iv(this.u_("sceneSize"), map.blocks_dims);

        //textures
        //shared resources:
        gl.uniform1i(this.u_("blocksData"), 4);

        //local resources:
        gl.uniform1i(this.u_("packedDataTex"), 1);
        

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
        this.frames++;
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

        this.cameraPos = [5.5, 1.5, 2.5];
        this.cameraVec = [1, 0, 0];
        //angle of camera
        this.camera = [0, 0];
        this.move = [0, 0, 0];
        

        this.editMode = false;
        this.editorLength = 2;
        this.editorMaterial = 0;
        this.cubesLit = 0;

        this.hp = 5;
        this.moveSpeed = 3;
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
        this.scrollHandler = this.scroll.bind(this);

        canvas.addEventListener("drop", this.filedropHandler);
        canvas.addEventListener("dragover", this.dragoverHandler);
        window.addEventListener('keydown',this.keydownHandler,false);
        window.addEventListener('keyup',this.keyupHandler,false);
        document.addEventListener('pointerlockchange', this.pointerlockchangeHandler, false);
        document.addEventListener('pointerlockerror', lockError, false);
        canvas.addEventListener('click', this.clickHandler, false);
        canvas.addEventListener('wheel', this.scrollHandler, false);


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
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32I, map.blocks_dims[0], map.blocks_dims[1], map.blocks_dims[2], 0, gl.RED_INTEGER, gl.INT, new Int32Array(map.blocks));
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        //INIT PROGRAMS
        let editor_prog = new RTR();
        let baking_prog = new Precomputer();

        await editor_prog.initProgram();
        await baking_prog.initProgram();
        map.setUniforms(baking_prog, true);

        this.programs.push(editor_prog);
        this.programs.push(baking_prog);
        
        gl.viewport(0, 0, canvas.width, canvas.height);

        this.resizeObserver = new ResizeObserver(this.resizeCanvasToDisplaySize.bind(this));
        this.resizeObserver.observe(canvas);
        this.resizeCanvasToDisplaySize([{target: gl.canvas}]);
        //start rendering cycle
        window.requestAnimationFrame(this.draw.bind(this));
    }
    scroll(e) {
        if(this.editMode) {
            this.editorLength += -e.deltaY * 0.004;
            this.editorLength = Math.max(0.1, this.editorLength);
        }
    }
    dragover(e) {
        e.preventDefault();
    }
    filedrop(e) {
        e.preventDefault();
        e.stopPropagation();
        let file = e.dataTransfer.files[0];
        let reader = new FileReader();
        if(file.size < 100000) {
            reader.onload = (e) => {
                let data = e.target.result;
                
                let loadedMap = JSON.parse(data);
                debugger;
                map.importMap(loadedMap);
                map.setUniforms(this.programs[0], false);
                map.setUniforms(this.programs[1], true);
                map.blocksDirty = true;
            }
            reader.readAsBinaryString(file);
        }
        else {
            reader.onload = (e) => {
                let data = e.target.result;
    
                let float32Data = new Float32Array(data);
                this.programs[this.currentProgram].setTextureContent(float32Data);
            }
            reader.readAsArrayBuffer(file);
        }
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
        if(e.key == "l") {
            if(this.editMode) {
                this.editMode = false;
                map.staticLights.pop();
                map.setUniforms(this.programs[0]);
            }
            //save map as "map.json"
            let mapjson = map.export();
            let blob = new Blob([mapjson], {type: "application/json"});
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.download = "map.json";
            a.href = url;
            a.click();

        }
        if(e.key == "1") {
            if(this.currentProgram != 0) {
                console.log('total frames: ' + this.programs[1].frames);
                this.programs[1].frames = 0;
            }
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
        if(e.key == "k") {
            if(!this.editMode) {
                this.programs[0].rtxOFF();

                //add small sphere to the cursor
                map.staticLights.push({
                    position: this.getEditorPos(),
                    power: [30000, 3000, 30000],
                    radius: 0.1
                });
                map.setUniforms(this.programs[0]);
            }
            else {
                map.staticLights.pop();
                map.setUniforms(this.programs[0]);
            }
            this.editMode = !this.editMode;
        }
        if(e.key == "=") {
            this.editorMaterial++;
            this.editorMaterial = Math.min(this.editorMaterial, map.materials.length - 1);
        }
        if(e.key == "-") {
            this.editorMaterial--;
            this.editorMaterial = Math.max(this.editorMaterial, 0);
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
    click(e) {
        if(document.pointerLockElement != gl.canvas)
            gl.canvas.requestPointerLock();
        else {
            if(this.editMode) {
                let rb = e.which == 3;
                let pos = this.getEditorPos();
                pos[0] = Math.floor(pos[0]);
                pos[1] = Math.floor(pos[1]);
                pos[2] = Math.floor(pos[2]);
                let block = this.editorMaterial;
                if(rb)
                    block = -1;
                map.setBlock(pos[0], pos[1], pos[2], block);
            }
            else {
                //shoot
                let dir = this.cameraVec;
                map.dynamicSpheres.push({
                    position: this.cameraPos,
                    radius: 0.05,
                    material: new Material(0.0, [0.0, 0.0, 0.0], 0.0, [0, 1000, 1000]),
                    type: 1,
                    direction: scale(dir, 1.0),
                    speed: 12,
                    t: 0,
                    livetime: 1000,
                    side: 1
                });
            }
        }
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
    getEditorPos() {
        return add(this.cameraPos, scale(this.cameraVec, this.editorLength));
    }
    resetLevel(res) {
        alert(res ? 'You win!' : 'You lose!');
        this.stopped = true;
    }
    draw(timestamp) {  
        
        if(this.stopped) {
            window.requestAnimationFrame(this.draw.bind(this));
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
        if(this.editMode) {
            map.staticLights[map.staticLights.length-1].position = this.getEditorPos();
        }
        else {
            //gameplay
            for(let i = 1; i < map.dynamicCubes.length; i++) {
                if((map.dynamicCubes[i].set === false || map.dynamicCubes[i].set === true && map.dynamicCubes[i].t < 500) && length(sub(this.cameraPos, scale(add(map.dynamicCubes[i].pos1, map.dynamicCubes[i].pos2), 0.5))) < 2) {
                    if(!map.dynamicCubes[i].set) {
                        map.dynamicCubes[i].set = true;
                        map.dynamicCubes[i].t = 0;
                        this.cubesLit++;
                    }
                    let t = map.dynamicCubes[i].t;
                    map.dynamicCubes[i].material.emission = [2.0 * t, 0.8 * t, 1.5 * t];

                    map.dynamicCubes[i].t += timestamp - this.lastTimestamp;
                }
            }
            if(this.cubesLit == map.dynamicCubes.length - 1) {
                if(map.dynamicCubes[0].set === true && length(sub(this.cameraPos, scale(add(map.dynamicCubes[0].pos1, map.dynamicCubes[0].pos2), 0.5))) < 2) {
                    this.resetLevel(true);
                }
                let level = 1.0;
                if(map.dynamicCubes[0].set === false) {
                    map.dynamicCubes[0].set = true;
                }
                if(map.dynamicCubes[0].t < 500) {
                    level = map.dynamicCubes[0].t / 500;

                    map.dynamicCubes[0].t += timestamp - this.lastTimestamp;
                }
                map.dynamicCubes[0].material.emission = scale([1000 * Math.sin(timestamp/300 + 200), 1000 * Math.sin(timestamp/400 + 700), 1000 * Math.sin(timestamp/500)], level);
            }
            
            for(let i = 0; i < map.dynamicSpheres.length; i++) 
            {
                let sphere = map.dynamicSpheres[i];
                if(sphere.type == 0) {
                    if(sphere.mob == 0) {
                        //mob
                        if(sphere.t <= 0) {
                            if(length(sub(this.cameraPos, sphere.position)) > sphere.activationRadius || sphere.hp <= 0) {
                                continue;
                            }
                            if(Math.random() < -sphere.t/200000) {
                                sphere.t = 0.1;
                            }
                            else {
                                sphere.t-= timestamp - this.lastTimestamp;
                            }
                        }
                        if(sphere.t > 0) {
                            if(sphere.t < 1000) {
                                sphere.material.emission = scale([1000, 200, 100], sphere.t/1000);
                                sphere.t+= timestamp - this.lastTimestamp;
                            }
                            else {
                                sphere.material.emission = [0.0, 0.0, 0.0];
                                sphere.t = 0;
                                //shoot
                                let dir = normalize(sub(sphere.position, this.cameraPos));
                                map.dynamicSpheres.push({
                                    position: sphere.position,
                                    radius: 0.1,
                                    material: new Material(0.0, [0.0, 0.0, 0.0], 0.0, [1000, 0, 0]),
                                    type: 1,
                                    direction: scale(dir, -1),
                                    speed: 9,
                                    t: 0,
                                    livetime: 5000,
                                    side: 0
                                });

                            }
                        }
                    }
                    else {
                        if(length(sub(this.cameraPos, sphere.position)) > sphere.activationRadius || sphere.hp <= 0) {
                            continue;
                        }
                        let dir = scale(normalize(sub(sphere.position, this.cameraPos)), -1);
                        sphere.position = add(sphere.position, scale(dir, (timestamp - this.lastTimestamp)/1000 * sphere.speed));
                    }
                }
                else if(sphere.type == 1) {
                    //bullet
                    if(sphere.t < sphere.livetime) {
                        sphere.t+= timestamp - this.lastTimestamp;
                        if(sphere.t < 1000) {
                            sphere.position = add(sphere.position, scale(sphere.direction, (timestamp - this.lastTimestamp)/1000 * sphere.speed));
                        }
                    }
                    if(sphere.side == 1) {
                        //check collision 
                        for(let j = 0; j < map.dynamicSpheres.length; j++) {
                            let sphere2 = map.dynamicSpheres[j];
                            if(sphere2.type != 1 && length(sub(sphere.position, sphere2.position)) < sphere.radius + sphere2.radius){
                                sphere.t = sphere.livetime;
                                sphere2.hp--;
                                if(sphere2.hp <= 0) {
                                    sphere2.material.albedo = [0.3, 0.0, 0.0];
                                }
                            }
                        }
                    }
                }
                if(sphere.type == 1 && sphere.side == 0 || sphere.type == 0 && sphere.mob == 1) {
                    //check collision with player
                    if(length(sub(sphere.position, this.cameraPos)) < sphere.radius + 0.5) {
                        sphere.t = sphere.livetime;
                        this.hp--;
                        if(this.hp <= 0)
                            this.resetLevel(false);
                    }
                }
            }

        }
        map.dynamicSpheres = map.dynamicSpheres.filter(sphere => sphere.type != 1 || sphere.t < sphere.livetime);
        map.setUniforms(this.programs[0]);
        map.updateBlocks(this.programs[0]);

        

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