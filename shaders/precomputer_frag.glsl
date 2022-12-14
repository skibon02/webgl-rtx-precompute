#version 300 es

precision highp float;
precision highp isampler3D;
precision highp isampler2D;

in vec2 pos;

uniform vec2 u_resolution;
uniform float u_seed;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraVec;

//precompute info
const int pack_factor = 16;
uniform int u_sampleCount;
uniform isampler2D u_packedDataTex;

const int PixelsPerSample = 80;
const int SampleLength = 48;

//scene data
uniform ivec3 u_sceneSize;  //x,y,z dimensions
uniform isampler3D u_blocksData;    // material at block x+y*sceneSize.x+z*sceneSize.x*sceneSize.y

struct Material {
    vec3 albedo;
    vec3 emission;
    float reflectivity;
    float albedoFactor;
    bool isGlass;
};

uniform Material[20] u_materials;


struct SolidLight {
    vec3 position;
    vec3 power;
    float radius;
};

struct Sphere {
    vec3 center;
    float radius;
    Material material;
};

uniform int u_numSpheres;
uniform Sphere u_spheres[10];

uniform int u_numStaticLights;
uniform SolidLight u_staticLights[10];

//      DATA SECTION END

const float PI = 3.1415926535897932384626433832795;
const float eps = 1e-5;

float cur_seed;

out vec4 outColor;


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
    float res = fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 8241.52453 + seed);
    if(res == 0.0) {
        res = fract(sin(dot(gl_FragCoord.xyz + seed + 0.1236, scale)) * 2351.97625 + seed);
    }

    return res;
}

void createCoordinateSystem(vec3 normal, out vec3 tangent, out vec3 bitangent) {
    if (abs(normal.x) < 0.5) {
        tangent = cross(normal, vec3(1.0, 0.0, 0.0));
    } else {
        tangent = cross(normal, vec3(0.0, 1.0, 0.0));
    }
    bitangent = cross(normal, tangent);
}
vec3 cosineWeightedDirection(float seed, vec3 normal) {
    vec3 u, v;
    createCoordinateSystem(normal, u, v);
    float r1 = 2.0 * PI * random(vec3(12.9898, 78.233, 151.7182), seed);
    float r2 = random(vec3(63.7264, 10.873, 623.6736), seed);
    float r2s = sqrt(r2);
    vec3 d = normalize(u * cos(r1) * r2s + v * sin(r1) * r2s + normal * sqrt(1.0 - r2));
    return d;
}

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

bool wrongTrigger = false;
Intersection intersectBlocks(Ray ray) {
    Intersection res;

    vec3 rayDirInv = 1.0 / ray.dir;
    vec3 tMin = (vec3(0.0) - ray.origin) * rayDirInv;
    vec3 tMax = (vec3(u_sceneSize) - ray.origin) * rayDirInv;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);


    vec3 dirmask;
    if (tNear < tFar && tFar > eps) {
        float t = tNear - 1.0;
        if(tNear < eps)
            t = 0.0;
        vec3 r_pos = ray.origin + ray.dir * t;
        vec3 stepdir = sign(ray.dir);

        int count = 0;
        while(t < tFar - eps) {
            dirmask = vec3(0.0, 0.0, 0.0);
                   
            if(count > 50) {
                wrongTrigger = true;
                break;
            }
            
            vec3 t1 = vec3(0.0);
            if(stepdir.x >= 0.0) {
                t1.x = (ceil(r_pos.x + eps) - r_pos.x) * rayDirInv.x;
            } else {
                t1.x = (floor(r_pos.x - eps) - r_pos.x) * rayDirInv.x;
            }
            if(stepdir.y >= 0.0) {
                t1.y = (ceil(r_pos.y + eps) - r_pos.y) * rayDirInv.y;
            } else {
                t1.y = (floor(r_pos.y - eps) - r_pos.y) * rayDirInv.y;
            }
            if(stepdir.z >= 0.0) {
                t1.z = (ceil(r_pos.z + eps) - r_pos.z) * rayDirInv.z;
            } else {
                t1.z = (floor(r_pos.z - eps) - r_pos.z) * rayDirInv.z;
            }
            if(stepdir.x == 0.0) {
                t1.x = 100000.0;
            }
            if(stepdir.y == 0.0) {
                t1.y = 100000.0;
            }
            if(stepdir.z == 0.0) {
                t1.z = 100000.0;
            }

            float mint = min(t1.x, min(t1.y, t1.z));
            if(mint == t1.x) dirmask.x = 1.0;
            else
                if(mint == t1.y) dirmask.y = 1.0;
                else
                    if(mint == t1.z) dirmask.z = 1.0;
            t += mint;
            r_pos = ray.origin + ray.dir * t;

            ivec3 blockpos = ivec3(floor(r_pos + eps * dirmask * stepdir));
            ivec3 prevblockpos = ivec3(floor(r_pos - eps * dirmask * stepdir));
            if(blockpos.x < 0 || blockpos.y < 0 || blockpos.z < 0 ||
                blockpos.x > u_sceneSize.x - 1 || blockpos.y > u_sceneSize.y - 1 || blockpos.z > u_sceneSize.z - 1) {
                count++;
                continue;
            }
            int block = texelFetch(u_blocksData, blockpos, 0).r;
            int prevblock = texelFetch(u_blocksData, prevblockpos, 0).r;
            bool prevIsSolid = false;
            if(prevblockpos.x >= 0 && prevblockpos.y >= 0 && prevblockpos.z >= 0 &&
                prevblockpos.x <= u_sceneSize.x - 1 && prevblockpos.y <= u_sceneSize.y - 1 && prevblockpos.z <= u_sceneSize.z - 1
                && prevblock != -1) {
                    prevIsSolid = true;
            }
            if (block != -1 || prevIsSolid) {
                res.normal = -dirmask * stepdir;
                res.material = u_materials[block];
                if(block != -1) {
                    if(prevIsSolid && u_materials[prevblock].isGlass && u_materials[block].isGlass) {
                        //from glass to glass
                        count++;
                        continue;
                    }
                    // if(u_materials[prevblock].isGlass != 1.0) {
                    //     //from solid to solid/glass -> set solid
                    //     res.material = u_materials[prevblock];
                    //     res.normal = -res.normal;
                    // }
                }
                else {
                    //from solid to air
                    res.material = u_materials[prevblock];
                    res.normal = -res.normal;
                }
                res.distance = t;
                res.position = r_pos;
                break;
            }
            count++;
        }
    }
    return res;
}

Intersection intersect(Ray ray) {
    Intersection intersection;
    intersection.distance = -1.0;

    for (int i = 0; i < u_numSpheres; i++) {
        Sphere sphere = u_spheres[i];
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
        }
    }


    for (int i = 0; i < u_numStaticLights; i++) {
        SolidLight solidLight = u_staticLights[i];
        Sphere sphere = Sphere(solidLight.position, solidLight.radius, Material(vec3(0.0), vec3(solidLight.power), 0.0, 0.0, false));
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
        }
    }

    // check collision with 3d grid
    Intersection res = intersectBlocks(ray);
    if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
        intersection = res;
    }

    return intersection;
}

const float finalLumScale = 0.0008;
const int MAX_BOUNCES = 6;
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
            if(diffuseCount >= 0) //any
                lightColor = intersection.material.emission;
            break;
        } else {
            // vec3 refractionGlassCoefs = vec3(1.39, 1.44, 1.47);
            // float maskFactor = random(vec3(412.1238, 237.478, 483.127), cur_seed + float(depth)+1.63);
            // vec3 mask = vec3(step(0.0, maskFactor) - step(0.3333, maskFactor), step(0.3333, maskFactor) - step(0.6666, maskFactor), step(0.6666, maskFactor) - step(1.0, maskFactor));
            
            if(intersection.material.isGlass) {
                // float n = dot(refractionGlassCoefs, mask);
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
                    // throughput *= mask * 3.0;
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
                    throughput *= intersection.material.albedo * intersection.material.albedoFactor / PI;
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
const int SAMPLES = 4;
const float aa_factor = 0.0;
void main() {
    cur_seed = u_seed;
    Ray ray;
    float fovscale = 1.0;
    if(u_resolution.y > u_resolution.x) {
        fovscale *= u_resolution.y / u_resolution.x;
    }
    
    
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
    sample_block_pos.x = (int(texelFetch(u_packedDataTex, ivec2(sample_loc, 0), 0).r) >> 4) % pack_factor;
    sample_block_pos.y = (int(texelFetch(u_packedDataTex, ivec2(sample_loc, 0), 0).r) >> 8) % pack_factor;
    sample_block_pos.z = (int(texelFetch(u_packedDataTex, ivec2(sample_loc, 0), 0).r) >> 12) % pack_factor;
    ivec3 next_block_pos = sample_block_pos;

    int side = (int(texelFetch(u_packedDataTex, ivec2(sample_loc, 0), 0).r) / (256*256)) - 3;

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
        ray.origin.y += texPix.x;
        ray.origin.z += texPix.y;

        ray.origin.x += 1.0;
    }
    if(side == -1) {
        ray.dir.x = -1.0;
        ray.origin.y += texPix.x;
        ray.origin.z += texPix.y;
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
    next_block_pos += ivec3(ray.dir);
    int blockMaterial;
    if(next_block_pos.x < 0 || next_block_pos.y < 0 || next_block_pos.z < 0 || next_block_pos.x >= u_sceneSize.x || next_block_pos.y >= u_sceneSize.y || next_block_pos.z >= u_sceneSize.z) {
        blockMaterial = -1;
    }
    else
        blockMaterial = texelFetch(u_blocksData, next_block_pos, 0).r;

    // outColor = vec4(vec3(float(side) + 3.0) / 7.0, 1.0); //visualize side
    // return;

    vec3 norm = ray.dir;

    //camera view
    // vec3 top = vec3(0.0, 1.0, 0.0);
    // vec3 right = normalize(cross(u_cameraVec, top));
    // top = normalize(cross(right, u_cameraVec));
    // ray.dir = normalize(u_cameraVec + right * (pos.x * u_resolution.x / u_resolution.y) * fovscale + top * (pos.y) * fovscale);
    // ray.origin = u_cameraPos;

    vec3 col = vec3(0.0);
    int samples_n = SAMPLES;
    for(int i = 0; i < samples_n; i++) {
        float scale = 1.0;
        ray.dir = cosineWeightedDirection(cur_seed + texCoord.x * 0.3 + texCoord.y * 3.3, norm);
        if(blockMaterial != -1 && u_materials[blockMaterial].isGlass) {
            //apply refraction 1.5
            float n = 1.5;
            float R0 = (1.0 - n) / (1.0 + n);
            R0 = R0 * R0;
            n = 1.0 / n;
            float cost1 = dot(ray.dir, norm);
            float cost2 = 1.0 - n * n * (1.0 - cost1 * cost1);
            float R = R0 + (1.0 - R0) * pow(1.0 - cost1, 5.0); // Schlick's approximation
            if (cost2 > 0.0) {
                scale = 1.0 - R;
                ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * -norm);
            } else {
                scale = 0.0;
            }
        }
        if(aa_factor > 0.0) {
            ray.dir.x += (random(vec3(525.315, 126.26, 12.42), cur_seed + float(i)) - 0.5) / u_resolution.x * aa_factor;
            ray.dir.y += (random(vec3(125.231, 162.135, 115.321), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir.z += (random(vec3(23.157, 426.84, 425.721), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir = normalize(ray.dir);
        }
        cur_seed += random(vec3(315.231, 13.5123, 125.3215), cur_seed + float(i));
        col += pathTrace(ray) * scale;
    }
    col /= float(samples_n);
    col *=  finalLumScale;
    if(wrongTrigger)
        outColor = vec4(5000000.0, 0.0, 0.0, 1.0) / 1024.0;
    else
        outColor = vec4(col, 1.0) / 1024.0;
}