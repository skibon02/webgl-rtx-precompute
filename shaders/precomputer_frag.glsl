#version 300 es
//FUCK WEBGL LIMIT 4096 UNIFORMS

precision highp float;

in vec2 pos;

const int Chunk_Size = 15;

const int buf_size = 4020;
const int pack_factor = 16;
uniform int u_packedData[buf_size];
uniform vec2 u_resolution;
uniform float u_seed;

uniform vec3 u_cameraPos;
uniform vec3 u_cameraVec;
struct Material {
    vec3 albedo;
    vec3 emission;
    float reflectivity;
    float albedoFactor;
    float isGlass;
};

uniform Material[2] u_materials;

int get_block(int i) {
    return u_packedData[i] % pack_factor - 1;
}
//precompute info

const int PixelsPerSample = 16;
const int SampleLength = 55;
uniform int u_sampleCount;
// uniform sampler2D u_texture;


const float PI = 3.1415926535897932384626433832795;
const float eps = 1e-5;

float cur_seed;

out vec4 outColor;


struct Sphere {
    vec3 center;
    float radius;
    Material material;
};

struct Cube {
    vec3 min;
    vec3 max;
    Material material;
};

struct Intersection {
    vec3 position;
    vec3 normal;
    float distance;

    Material material;
};

struct Ray {
    vec3 origin;
    vec3 dir;
};

float random(vec3 scale, float seed) {
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}

void createCoordinateSystem(vec3 normal, out vec3 tangent, out vec3 bitangent) {
    if (abs(normal.x) > abs(normal.z)) {
        float invLen = 1.0 / sqrt(normal.x * normal.x + normal.y * normal.y);
        tangent = vec3(-normal.y * invLen, normal.x * invLen, 0.0);
    } else {
        float invLen = 1.0 / sqrt(normal.y * normal.y + normal.z * normal.z);
        tangent = vec3(0.0, -normal.z * invLen, normal.y * invLen);
    }
    bitangent = cross(normal, tangent);
}
vec3 cosineWeightedDirection(float seed, vec3 normal) {
    vec3 rotX, rotY;
    createCoordinateSystem(normal, rotX, rotY);
    float r1 = 2.0 * PI * random(vec3(12.9898, 78.233, 151.7182), seed);
    float r2 = random(vec3(63.7264, 10.873, 623.6736), seed);
    float r2s = sqrt(r2);
    vec3 w = normal;
    vec3 u = rotX;
    vec3 v = rotY;
    vec3 d = normalize(u * cos(r1) * r2s + v * sin(r1) * r2s + w * sqrt(1.0 - r2));
    return d;
}
//Scene
const int numSpheres = 4;
Sphere spheres[numSpheres] = Sphere[](
    // //metal
    // Sphere(vec3(-0.75, -1.45, -4.4), 1.05, 
    // Material(
    //     vec3(0.8, 0.4, 0.8), 
    //     vec3(0.0), 1.0, 0.8, false)),

    // //glass
    // Sphere(vec3(2.0, -2.05, -3.7), 0.5, 
    // Material(
    //     vec3(0.9, 1.0, 0.8), 
    //     vec3(0.0), 0.0, 0.8, true)),

    // Sphere(vec3(-1.75, -1.95, -3.1), 0.6, 
    // Material(
    //     vec3(1, 1, 1), 
    //     vec3(0.0), 0.0, 0.8, false)),

    //light
    Sphere(vec3(7, 4, -2), 1.0, 
        Material(
            vec3(0.0, 0.0, 0.0), 
            vec3(5000.0, 4000.0, 4500.0) * 12.0, 0.0, 0.8, 0.0)),
    Sphere(vec3(7, 15.4, -2), 1.0, 
        Material(
            vec3(0.0, 0.0, 0.0), 
            vec3(1000.0, 4000.0, 4500.0) * 12.0, 0.0, 0.8, 0.0)),
    Sphere(vec3(-2, 4.4, 9), 1.0, 
        Material(
            vec3(0.0, 0.0, 0.0), 
            vec3(4000.0, 1000.0, 4500.0) * 12.0, 0.0, 0.8, 0.0)),
    Sphere(vec3(7, 6.4, 17), 1.0, 
        Material(
            vec3(0.0, 0.0, 0.0), 
            vec3(4000.0, 4500.0, 1000.0) * 12.0, 0.0, 0.8, 0.0))
);

Intersection intersectSphere(Ray ray, Sphere sphere) {
    Intersection res;
    res.distance = -1.0;
    vec3 oc = ray.origin - sphere.center;
    float b = dot(oc, ray.dir);
    float c = dot(oc, oc) - sphere.radius * sphere.radius;
    float h = b * b - c;

    if (h >= 0.0) {
        float h = sqrt(h);
        float t = -b - h;
        if(t < eps)
            t = -b + h;
        res.distance = t;
        res.position = ray.origin + ray.dir * t;
        res.normal = normalize(res.position - sphere.center);
        res.material = sphere.material;
    }

    return res;
}

Intersection intersectBlocks(Ray ray) {
    Intersection res;

    vec3 rayDirInv = 1.0 / ray.dir;
    vec3 tMin = (vec3(0.0) - ray.origin) * rayDirInv;
    vec3 tMax = (vec3(Chunk_Size) - ray.origin) * rayDirInv;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);


    vec3 dirmask;
    if (tNear < tFar && tFar > eps) {
        float t = tNear;
        if(tNear < eps)
            t = 0.0;
        vec3 pos = ray.origin + ray.dir * t;
        vec3 stepdir = sign(ray.dir);


        int count = 0;
        while(t < tFar - eps) {
            dirmask = vec3(0.0, 0.0, 0.0);

            vec3 t1 = vec3(0.0);
            if(stepdir.x >= 0.0) {
                t1.x = (ceil(pos.x + eps) - pos.x) * rayDirInv.x;
            } else {
                t1.x = (floor(pos.x - eps) - pos.x) * rayDirInv.x;
            }
            if(stepdir.y >= 0.0) {
                t1.y = (ceil(pos.y + eps) - pos.y) * rayDirInv.y;
            } else {
                t1.y = (floor(pos.y - eps) - pos.y) * rayDirInv.y;
            }
            if(stepdir.z >= 0.0) {
                t1.z = (ceil(pos.z + eps) - pos.z) * rayDirInv.z;
            } else {
                t1.z = (floor(pos.z - eps) - pos.z) * rayDirInv.z;
            }

            if(t1.x == 0.0)
                t1.x = 100000.0;
            if(t1.y == 0.0)
                t1.y = 100000.0;
            if(t1.z == 0.0)
                t1.z = 100000.0;
            float mint = min(t1.x, min(t1.y, t1.z));
            if(mint == t1.x) dirmask.x = 1.0;
            else
                if(mint == t1.y) dirmask.y = 1.0;
                else
                    if(mint == t1.z) dirmask.z = 1.0;
            t += mint;
            pos += ray.dir * mint;

            vec3 blockpos = floor(pos + eps*ray.dir);

            int block = get_block(int(blockpos.x) + int(blockpos.z) * Chunk_Size + int(blockpos.y) * Chunk_Size * Chunk_Size);

            if (block != -1) {
                res.distance = t;
                res.position = pos;
                res.normal = -dirmask * stepdir;
                res.material = u_materials[block];
                break;
            }
            count++;
        }
        // return Intersection(ray.origin, vec3(0.0, t+1.0, 0.0), 1.0, u_materials[0]);
    }
    return res;
}

Intersection intersect(Ray ray) {
    Intersection intersection;
    intersection.distance = -1.0;

    for (int i = 0; i < numSpheres; i++) {
        Sphere sphere = spheres[i];
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > 0.0 && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
        }
    }

    // check collision with 3d grid
    Intersection res = intersectBlocks(ray);
    if (res.distance > 0.0 && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
        intersection = res;
    }

    return intersection;
}

const float finalLumScale = 0.0008;
const int MAX_BOUNCES = 4;
vec3 pathTrace(Ray ray) {
    int depth = 0;
    int diffuseCount = 0;
    //color of ray, that flew out of the camera
    vec3 lightColor = vec3(0.0);
    vec3 throughput = vec3(1.0);

    while(depth < MAX_BOUNCES) {
        Intersection intersection = intersect(ray);

        if(intersection.distance < 0.0) {
            break;
        }
        ray.origin = intersection.position;
        
        //update light color and throughput
        if(intersection.material.emission != vec3(0.0)) {
            if(diffuseCount >= 0)
                lightColor = intersection.material.emission;
            break;
        } else {
            if(intersection.material.isGlass == 1.0) {
                float n = 1.5;
                float R0 = (1.0 - n) / (1.0 + n);
                R0 = R0 * R0;
                if(dot(ray.dir, intersection.normal) > 0.0) {
                    intersection.normal = -intersection.normal;
                    n = 1.0 / n;
                }
                n = 1.0 / n;
                float cost1 = (-dot(ray.dir, intersection.normal));
                float cost2 = 1.0 - n * n * (1.0 - cost1 * cost1);
                float R = R0 + (1.0 - R0) * pow(1.0 - cost1, 5.0); // Schlick's approximation
                if (cost2 > 0.0 && random(vec3(252.315, 26.236, 152.9342), cur_seed + float(depth)) > R) {
                    ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * intersection.normal);
                } else {
                    ray.dir = normalize(reflect(ray.dir, intersection.normal));
                }
                throughput *= intersection.material.albedo;
            } 
            else {
                if(intersection.material.reflectivity < 1.0) {
                    diffuseCount++;
                }
                // // test normals
                // lightColor = abs(intersection.normal) * 500.0;
                // break;
                if(random(vec3(52.315, 126.236, 154.9342), cur_seed + float(depth)) >= intersection.material.reflectivity) {
                    //diffuse

                    ray.dir = cosineWeightedDirection(cur_seed + float(depth), intersection.normal);
                    float cost = dot(ray.dir, intersection.normal);
                    throughput *= intersection.material.albedo * intersection.material.albedoFactor * cost / PI;
                } else {
                    //reflection
                    float cost = dot(ray.dir, intersection.normal);
                    ray.dir = normalize(ray.dir - intersection.normal * cost * 2.0);
                    throughput *= intersection.material.albedo * intersection.material.albedoFactor;
                }
            }
        }

        depth++;
    }
    return lightColor * throughput;
}
const int SAMPLES = 8;
const float aa_factor = 0.0;
void main() {
    cur_seed = u_seed;
    Ray ray;
    float fovscale = 1.0;
    if(u_resolution.y > u_resolution.x) {
        fovscale *= u_resolution.y / u_resolution.x;
    }

    //unpack materials info
    int csc = Chunk_Size * Chunk_Size * Chunk_Size;
    int shift = 4*4;
    
    
    vec2 texCoord = pos * 0.5 + 0.5; // 0..1
    ivec2 texCoordPix = ivec2(round(texCoord * u_resolution)); // 0..resolution
    ivec2 texSample = texCoordPix / PixelsPerSample;    // 0..SampleLength
    vec2 texPix = vec2(texCoordPix % PixelsPerSample) / float(PixelsPerSample);       // 0..1
    
    int sample_loc = texSample.x + texSample.y * SampleLength;
    if(min(texSample.x, texSample.y) < 0 || max(texSample.x, texSample.y) >= SampleLength)
    {
        outColor = vec4(vec3(0.5), 1.0);   
        return;
    }
    if(sample_loc >= u_sampleCount) {
        outColor = vec4(vec3(0.4, 0.8, 0.8), 1.0);   
        return;
    }

    //extract the positions
    ivec3 sample_block_pos = ivec3(0.0);
    sample_block_pos.x = (u_packedData[sample_loc] >> 4) % pack_factor;
    sample_block_pos.y = (u_packedData[sample_loc] >> 8) % pack_factor;
    sample_block_pos.z = (u_packedData[sample_loc] >> 12) % pack_factor;

    int side = (u_packedData[sample_loc] / (256*256)) - 3;

    ray.origin = vec3(sample_block_pos);
    ray.dir = vec3(0);
    if(texPix.x == 0.0) {
        texPix.x = 0.01;
    }
    if(texPix.y == 0.0) {
        texPix.y = 0.01;
    }
    if(side == 1) {
        ray.dir.x = 1.0;
        ray.origin.z += texPix.x;
        ray.origin.y += texPix.y;
        ray.origin.x += 1.0;
    }
    if(side == -1) {
        ray.dir.x = -1.0;
        ray.origin.z += texPix.x;
        ray.origin.y += texPix.y;
    }
    if(side == 2) {
        ray.dir.y = 1.0;
        ray.origin.x += texPix.x;
        ray.origin.z += texPix.y;
        ray.origin.y += 1.0;
    }
    if(side == -2) {
        ray.dir.y = -1.0;
        ray.origin.x += texPix.x;
        ray.origin.z += texPix.y;
    }
    if(side == 3) {
        ray.dir.z = 1.0;
        ray.origin.x += texPix.x;
        ray.origin.y += texPix.y;
        ray.origin.z += 1.0;
    }
    if(side == -3) {
        ray.dir.z = -1.0;
        ray.origin.x += texPix.x;
        ray.origin.y += texPix.y;
    }
    // outColor = vec4(vec3(float(side) + 3.0) / 7.0, 1.0); //visualize side
    // return;

    ray.dir = cosineWeightedDirection(cur_seed + texCoord.x * 0.3 + texCoord.y * 3.3, ray.dir);

    //camera view
    // vec3 top = vec3(0.0, 1.0, 0.0);
    // vec3 right = normalize(cross(u_cameraVec, top));
    // top = normalize(cross(right, u_cameraVec));
    // ray.dir = normalize(u_cameraVec + right * (pos.x * u_resolution.x / u_resolution.y) * fovscale + top * (pos.y) * fovscale);
    // ray.origin = u_cameraPos;

    vec3 col = vec3(0.0);
    int samples_n = SAMPLES;
    for(int i = 0; i < samples_n; i++) {
        if(aa_factor > 0.0) {
            ray.dir.x += (random(vec3(525.315, 126.26, 12.42), cur_seed + float(i)) - 0.5) / u_resolution.x * aa_factor;
            ray.dir.y += (random(vec3(125.231, 162.135, 115.321), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir.z += (random(vec3(23.157, 426.84, 425.721), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir = normalize(ray.dir);
        }
        cur_seed += random(vec3(315.231, 13.5123, 125.3215), cur_seed + float(i));
        col += pathTrace(ray);
    }
    col /= float(samples_n);
    col *=  finalLumScale;
    //gamma correction
    col = pow(col, vec3(1.0 / 2.2));
    outColor = vec4(col, 1.0) / 1024.0;
}