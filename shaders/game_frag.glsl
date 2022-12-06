#version 300 es

precision highp float;
precision highp isampler2D;
precision highp isampler3D;

in vec2 pos;

uniform vec2 u_resolution;
uniform float u_seed;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraVec;

//blocks precompute data
const float PixelsPerSample = 100.0;
const int SampleLength = 40;
uniform sampler2D u_precompTex;
uniform isampler2D u_precompMappingData;
uniform int u_precompUsed;

//scene data
uniform ivec3 u_sceneSize;  //x,y,z dimensions
uniform isampler3D u_blocksData;    // material at block x+y*sceneSize.x+z*sceneSize.x*sceneSize.y

struct Material {
    vec3 albedo;
    vec3 emission;
    float reflectivity;
    float albedoFactor;
    float isGlass;
    vec3 luminosity;
};
uniform Material[50] u_materials;

//      DATA SECTION END



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

struct PointLight {
    vec3 position;
    vec3 power;
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

// const int numSpheres = 4;
// Sphere spheres[numSpheres] = Sphere[](
//     //metal
//     Sphere(vec3(-0.75, -1.45, -4.4), 1.05, 
//     Material(
//         vec3(0.8, 0.4, 0.8), 
//         vec3(0.0), 1.0, 0.8, false)),

//     //glass
//     Sphere(vec3(2.0, -2.05, -3.7), 0.5, 
//     Material(
//         vec3(0.9, 1.0, 0.8), 
//         vec3(0.0), 0.0, 0.8, true)),

//     Sphere(vec3(-1.75, -1.95, -3.1), 0.6, 
//     Material(
//         vec3(1, 1, 1), 
//         vec3(0.0), 0.0, 0.8, false)),

//     //light
//     Sphere(vec3(0, 17.8, -1), 15.0, 
//         Material(
//             vec3(0.0, 0.0, 0.0), 
//             vec3(50000.0, 40000.0, 45000.0), 0.0, 0.8, false))
// );

const int numPointLights = 4;
PointLight pointLights[numPointLights] = PointLight[](
    PointLight(vec3(7, 4, -2), vec3(50000.0, 40000.0, 45000.0) * 0.3),
    PointLight(vec3(7, 15.4, -2), vec3(10000.0, 40000.0, 45000.0) * 0.3),
    PointLight(vec3(-2, 4.4, 9), vec3(40000.0, 10000.0, 45000.0) * 0.3),
    PointLight(vec3(7, 6.4, 17), vec3(40000.0, 45000.0, 10000.0) * 0.3)
    
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
    vec3 tMax = (vec3(u_sceneSize) - ray.origin) * rayDirInv;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);


    vec3 dirmask;
    if (tNear < tFar && tFar > eps) {
        float t = tNear;
        if(tNear < eps)
            t = 0.0;
        vec3 r_pos = ray.origin + ray.dir * t;
        vec3 stepdir = sign(ray.dir);

        int count = 0;
        while(t < tFar - eps) {
            dirmask = vec3(0.0, 0.0, 0.0);

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

            float mint = min(t1.x, min(t1.y, t1.z));
            if(mint == t1.x) dirmask.x = 1.0;
            else
                if(mint == t1.y) dirmask.y = 1.0;
                else
                    if(mint == t1.z) dirmask.z = 1.0;
            t += mint;
            r_pos += ray.dir * mint;

            ivec3 blockpos = ivec3(floor(r_pos + eps*ray.dir));
            if(blockpos.x < 0 || blockpos.x >= u_sceneSize.x ||
                blockpos.y < 0 || blockpos.y >= u_sceneSize.y ||
                blockpos.z < 0 || blockpos.z >= u_sceneSize.z) {
                break;
            }
            int blockPosLin = blockpos.x + blockpos.y * u_sceneSize.x + blockpos.z * u_sceneSize.x * u_sceneSize.y;
            int block = texelFetch(u_blocksData, blockpos, 0).r;
            
            if (block != -1) {
                res.distance = t;
                res.position = r_pos;
                res.normal = -dirmask * stepdir;
                res.material = u_materials[block];

                //extract luminocity from texture
                int side = 0;
                if(res.normal.x == -1.0) {
                    side = 0;
                }
                if(res.normal.x == 1.0) {
                    side = 1;
                }
                if(res.normal.y == -1.0) {
                    side = 2;
                }
                if(res.normal.y == 1.0) {
                    side = 3;
                }
                if(res.normal.z == -1.0) {
                    side = 4;
                }
                if(res.normal.z == 1.0) {
                    side = 5;
                }
                int sampleLocLin = texelFetch(u_precompMappingData, ivec2(blockPosLin, side), 0).r; // blockpos to sample location
                ivec2 sampleLoc = ivec2(sampleLocLin % SampleLength, sampleLocLin / SampleLength);

                vec2 sampleLocalOffset; // offset in block pos 0..1
                if(res.normal.x != 0.0)
                    sampleLocalOffset = vec2(r_pos.y - float(blockpos.y), r_pos.z - float(blockpos.z));
                if(res.normal.y != 0.0)
                    sampleLocalOffset = vec2(r_pos.x - float(blockpos.x), r_pos.z - float(blockpos.z));
                if(res.normal.z != 0.0)
                    sampleLocalOffset = vec2(r_pos.x - float(blockpos.x), r_pos.y - float(blockpos.y));

                vec2 sampleLocalPos = vec2(sampleLocalOffset.x * PixelsPerSample - 1.0, sampleLocalOffset.y*PixelsPerSample - 1.0); // position in texture 0..PixelsPerSample
                vec2 samplePos = sampleLocalPos + vec2(sampleLoc * int(PixelsPerSample)); //position in texture 0..4096
                
                vec4 precompPixel = texture(u_precompTex, samplePos / 4096.0);
                // vec4 precompPixel = texelFetch(u_precompTex, ivec2(samplePos), 0);
                res.material.luminosity = precompPixel.rgb / precompPixel.a;
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

    // for (int i = 0; i < numSpheres; i++) {
    //     Sphere sphere = spheres[i];
    //     Intersection res = intersectSphere(ray, sphere);
    //     if (res.distance > 0.0 && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
    //         intersection = res;
    //     }
    // }

    // check collision with 3d grid
    Intersection res = intersectBlocks(ray);
    if (res.distance > 0.0 && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
        intersection = res;
    }

    return intersection;
}

vec3 addDirectLight(Intersection intersection) {
    vec3 color = vec3(0.0);
    vec3 tan, bitan;
    createCoordinateSystem(intersection.normal, tan, bitan);
    for (int i = 0; i < numPointLights; i++) {
        PointLight pointLight = pointLights[i];
        vec3 lightDir = normalize(pointLight.position - intersection.position);
        float lightDistance = length(pointLight.position - intersection.position);
        float lightIntensity = 1.0 / (lightDistance * lightDistance);
        Ray shadowRay = Ray(intersection.position + intersection.normal * eps, lightDir);
        Intersection shadowIntersection = intersect(shadowRay);
        if (shadowIntersection.distance < 0.0 || shadowIntersection.distance > lightDistance) {
            color += pointLight.power * lightIntensity * max(0.0, dot(intersection.normal, lightDir));
        }

    }
    return color;
}

const float finalLumScale = 0.0008;
const int MAX_BOUNCES = 6;
bool hitGlass = false;
int hitGlassI = 0;
int decision = 0;
vec3 pathTrace(Ray ray) {
    int depth = 0;
    //color of ray, that flew out of the camera
    vec3 lightColor = vec3(0.0);
    vec3 resColor = vec3(0.0);
    vec3 throughput = vec3(1.0);

    while(depth < MAX_BOUNCES) {
        Intersection intersection = intersect(ray);
        if(intersection.distance == -1.0) {
            break;
        }
        ray.origin = intersection.position;
        
        //update light color and throughput
        if(intersection.material.emission != vec3(0.0)) {
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
                cur_seed += random(vec3(16.231, 132.52, 25.3215), cur_seed);
                throughput *= intersection.material.albedo;
                if(cost2 > 0.0) {
                    if(hitGlassI > 1)
                    {
                        ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * intersection.normal);
                    }
                    else
                        if(hitGlassI == 0 && decision % 2 == 0 || hitGlassI == 1 && decision / 2 == 0) {
                            ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * intersection.normal);
                            throughput *= (1.0 - R) * 2.0;
                        }
                        else {
                            ray.dir = normalize(reflect(ray.dir, intersection.normal));
                            throughput *= R * 2.0;
                        }
                }
                else {
                    ray.dir = normalize(reflect(ray.dir, intersection.normal));
                }
                hitGlass = true;
                hitGlassI++;
            } 
            else {
                // test normals
                // lightColor = abs(intersection.normal) * 500.0;
                // break;
                float diffuseFactor = 1.0 - intersection.material.reflectivity;
                float reflectFactor = intersection.material.reflectivity;
                //diffuse

                if(u_precompUsed == 1) {
                    resColor += intersection.material.luminosity / finalLumScale * diffuseFactor * intersection.material.albedo * intersection.material.albedoFactor * throughput / PI;
                }
                else {
                    vec3 lightEmission = addDirectLight( intersection);
                    resColor += lightEmission * intersection.material.albedo * intersection.material.albedoFactor * throughput * diffuseFactor / PI;
                }
                if(reflectFactor == 0.0) {
                    break;
                }
                
                //reflection
                float cost = dot(ray.dir, intersection.normal);
                ray.dir = normalize(ray.dir - intersection.normal * cost * 2.0);
                
                throughput *= intersection.material.albedo * intersection.material.albedoFactor * reflectFactor;
            }
        }

        depth++;
    }
    return resColor + lightColor * throughput;
}
const int SAMPLES = 1;
const float aa_factor = 0.0;
void main() {
    cur_seed = u_seed;
    Ray ray;
    float fovscale = 1.0;
    if(u_resolution.y > u_resolution.x) {
        fovscale *= u_resolution.y / u_resolution.x;
    }
    //get vector from angles

    vec2 pixpos = ((pos * 0.5)  + 0.5) * u_resolution;
    
    vec3 top = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(u_cameraVec, top));
    top = normalize(cross(right, u_cameraVec));
    ray.dir = normalize(u_cameraVec + right * (pos.x * u_resolution.x / u_resolution.y) * fovscale + top * (pos.y) * fovscale);

    //ray.dir = vec3(0.0, 0.0, -1.0) + vec3(pos.x*(u_resolution.x / u_resolution.y), pos.y, 0.0) * fovscale;
    ray.dir = normalize(ray.dir);
    ray.origin = u_cameraPos;
    vec3 col = vec3(0.0);
    int samples_n = SAMPLES;
    for(int i = 0; i < samples_n; i++) {
        decision = i;
        hitGlassI = 0;
        if(aa_factor > 0.0) {
            ray.dir.x += (random(vec3(525.315, 126.26, 12.42), cur_seed + float(i)) - 0.5) / u_resolution.x * aa_factor;
            ray.dir.y += (random(vec3(125.231, 162.135, 115.321), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir.z += (random(vec3(23.157, 426.84, 425.721), cur_seed + float(i)) - 0.5) / u_resolution.y * aa_factor;
            ray.dir = normalize(ray.dir);
        }
        cur_seed += random(vec3(315.231, 13.5123, 125.3215), cur_seed + float(i));
        col += pathTrace(ray);
        if(hitGlass)
            samples_n= 4;
    }
    col /= float(samples_n);
    col *=  finalLumScale;
    vec2 texCoord = pos * 0.5 + 0.5;
    //gamma correction
    col = pow(col, vec3(1.0 / 2.2));
    outColor = vec4(col, 1.0);
}