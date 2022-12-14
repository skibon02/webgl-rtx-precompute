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
const int MAX_LIGHT_GROUPS = 8;
const float PixelsPerSample = 80.0;
const int SampleLength = 48;
uniform sampler2D u_precompTex[MAX_LIGHT_GROUPS];
uniform isampler2D u_precompMappingData;
uniform int u_precompUsed;

uniform vec3 u_lightGroupScale[MAX_LIGHT_GROUPS];

//scene data
uniform ivec3 u_sceneSize;  //x,y,z dimensions
uniform isampler3D u_blocksData;    // material at block x+y*sceneSize.x+z*sceneSize.x*sceneSize.y

struct Material {
    vec3 albedo;
    vec3 emission;
    float reflectivity;
    float albedoFactor;
    bool isGlass;
    int lightGroup;
};
uniform Material[20] u_materials;

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
};
struct SolidLight {
    vec3 position;
    vec3 power;
    float radius;
    int lightGroup;
};

//static scene: spheres, solidLights
uniform int u_numSpheres;
uniform Sphere u_spheres[10];

uniform int u_numStaticLights;
uniform SolidLight u_staticLights[10];

// only RTR objects:
uniform int u_numCubes;
uniform Cube u_cubes[20];

uniform int u_numDynamicSpheres;
uniform Sphere u_dynamicSpheres[30];

uniform int u_numFakePointLights;
uniform PointLight u_fakePointLights[10];
//      DATA SECTION END



const float PI = 3.1415926535897932384626433832795;
const float eps = 3e-5;

float cur_seed;

out vec4 outColor;

struct Intersection {
    vec3 position;
    vec3 normal;
    float distance;

    int objectUID;
    vec3 luminosity; // -1 if object doesn't contain light info
    Material material;
};

struct Ray {
    vec3 origin;
    vec3 dir;
};

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

Intersection intersectCube(Ray ray, Cube cube) {
    Intersection res;
    res.distance = -1.0;

    vec3 rayDirInv = 1.0 / ray.dir;
    vec3 tMin = (cube.min - ray.origin) * rayDirInv;
    vec3 tMax = (cube.max - ray.origin) * rayDirInv;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);

    vec3 stepsign = sign(ray.dir);
    vec3 dirmask;
    if(tNear == t1.x) dirmask.x = 1.0;
    else
        if(tNear == t1.y) dirmask.y = 1.0;
        else
            if(tNear == t1.z) dirmask.z = 1.0;

    if (tNear < tFar && tFar > eps) {
        float t = tNear;
        if(tNear < eps) {
            t = tFar;
            if(tFar == t2.x) dirmask.x = 1.0;
            else
                if(tFar == t2.y) dirmask.y = 1.0;
                else
                    if(tFar == t2.z) dirmask.z = 1.0;
        }
        res.distance = t;
        res.position = ray.origin + ray.dir * t;
        res.normal = -stepsign * dirmask;
        res.material = cube.material;
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
            int blockPosLin = blockpos.x + blockpos.y * u_sceneSize.x + blockpos.z * u_sceneSize.x * u_sceneSize.y;
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
                    if(prevIsSolid) {
                        if(u_materials[prevblock].isGlass && u_materials[block].isGlass) {
                            //from glass to glass -> passthrough
                            count++;
                            continue;
                        }
                        if(!u_materials[prevblock].isGlass) {
                            //from solid to solid/glass -> set solid
                            res.material = u_materials[prevblock];
                            res.normal = -res.normal;
                        }
                        //glass to solid -> keep solid
                    }
                }
                else {
                    //from solid to air
                    res.material = u_materials[prevblock];
                    res.normal = -res.normal;
                }
                res.distance = t;
                res.position = r_pos;

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
                
                {
                    vec4 precompPixel = texture(u_precompTex[0], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[0];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[1], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[1];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[2], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[2];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[3], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[3];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[4], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[4];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[5], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[5];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[6], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[6];
                }
                {
                    vec4 precompPixel = texture(u_precompTex[7], samplePos / 4096.0);
                    if(precompPixel.a > 0.0)
                        res.luminosity += precompPixel.rgb / precompPixel.a * u_lightGroupScale[7];
                }
                // vec4 precompPixel = texelFetch(u_precompTex, ivec2(samplePos), 0);
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

    //intersect spheres
    for (int i = 0; i < u_numSpheres; i++) {
        Sphere sphere = u_spheres[i];
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
            intersection.objectUID = i;
        }
    }
    //intersect spheric lights
    for (int i = 0; i < u_numStaticLights; i++) {
        SolidLight solidLight = u_staticLights[i];
        Sphere sphere = Sphere(solidLight.position, solidLight.radius, Material(vec3(0.0), vec3(solidLight.power), 0.0, 0.0, false, solidLight.lightGroup));
        sphere.material.emission *= 0.15; //to be different from pure white
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
            intersection.objectUID = -10000*(i+1);
        }
    }


    // check collision with 3d grid
    Intersection res = intersectBlocks(ray);
    if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
        intersection = res;
        intersection.objectUID = -1;
    }

    //test dynamic objects
    //dynamic spheres
    for (int i = 0; i < u_numDynamicSpheres; i++) {
        Sphere sphere = u_dynamicSpheres[i];
        Intersection res = intersectSphere(ray, sphere);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
            intersection.luminosity = vec3(-1.0);
            intersection.objectUID = 100 * (i+1);
        }
    }
    //Cubes
    for (int i = 0; i < u_numCubes; i++) {
        Cube cube = u_cubes[i];
        Intersection res = intersectCube(ray, cube);
        if (res.distance > eps && (intersection.distance < 0.0 || res.distance < intersection.distance)) {
            intersection = res;
            intersection.luminosity = vec3(-1.0);
            intersection.objectUID = 10000 * (i+1);
        }
    }

    intersection.material.emission *= u_lightGroupScale[intersection.material.lightGroup];
    return intersection;
}

float isInDynamicShadow(Intersection intersection) {
    return 0.0;
    int shadowCNT = 0;
    int originalUID = intersection.objectUID;
    for (int i = 0; i < u_numFakePointLights; i++) {
        PointLight fakePointLight = u_fakePointLights[i];
        vec3 lightDir = normalize(fakePointLight.position - intersection.position);
        float lightDistance = (fakePointLight.position - intersection.position).x / lightDir.x;

        bool foundStaticObject = false;
        bool foundDynamicObject = false;

        vec3 initialPos = intersection.position + intersection.normal * eps;
        Ray shadowRay = Ray(initialPos, lightDir);
        Intersection shadowIntersection = intersect(shadowRay);
        float totalDistance = eps + shadowIntersection.distance;
        while (shadowIntersection.distance >= eps && totalDistance <= lightDistance) {

            if(shadowIntersection.luminosity.x >= 0.0) {
                foundStaticObject = true;
                break; //early quit optimization
            }
            else {
                if(shadowIntersection.objectUID != originalUID) {
                    foundDynamicObject = true;
                }
            }
            break;
            shadowRay.origin +=  eps * 5.0 * lightDir;
            shadowIntersection = intersect(shadowRay);
            if(shadowIntersection.distance == -1.0)
                break;
            totalDistance += shadowIntersection.distance;
        }

        if(foundDynamicObject && !foundStaticObject)
            shadowCNT++;
    }
    return float(shadowCNT) / float(u_numFakePointLights);
}
vec3 addDirectLight(Intersection intersection, bool onlyDynamic) {
    vec3 color = vec3(0.0);
    if(!onlyDynamic)
        for (int i = 0; i < u_numStaticLights; i++) {
            SolidLight pointLight = u_staticLights[i];
            vec3 lightDir = normalize(pointLight.position - intersection.position);
            float lightDistance = length(pointLight.position - intersection.position);
            float lightIntensity = 1.0 / (lightDistance * lightDistance);

            Ray shadowRay = Ray(intersection.position + intersection.normal * eps * 10.0, lightDir);
            Intersection shadowIntersection = intersect(shadowRay);
            float totalDistance = shadowIntersection.distance;

            bool objFound = false;
            while (totalDistance >= eps && totalDistance <= lightDistance && shadowIntersection.distance != -1.0) {
                if(!shadowIntersection.material.isGlass && shadowIntersection.objectUID != -10000*(i+1)) {
                    objFound = true;
                    break;
                }

                totalDistance += shadowIntersection.distance + eps*5.0;
                shadowRay.origin = intersection.position + shadowIntersection.normal * eps * 10.0 + totalDistance * lightDir;
                shadowIntersection = intersect(shadowRay);
            }
            if (!objFound) {
                vec3 emission = pointLight.power * (pointLight.radius * pointLight.radius) * u_lightGroupScale[pointLight.lightGroup];
                color += emission * lightIntensity * max(0.0, dot(intersection.normal, lightDir));
            }
        }
    bool enableDynamicLight = false;
    if(enableDynamicLight)
        for (int i = 0; i < u_numDynamicSpheres; i++) {
            Sphere sphere = u_dynamicSpheres[i];
            if(dot(sphere.material.emission, vec3(1.0, 1.0, 1.0)) == 0.0)
                continue;
            

            vec3 lightDir = normalize(sphere.center - intersection.position);
            float lightDistance = length(sphere.center - intersection.position);
            float lightIntensity = 1.0 / (lightDistance * lightDistance);

            Ray shadowRay = Ray(intersection.position + intersection.normal * eps * 10.0, lightDir);
            Intersection shadowIntersection = intersect(shadowRay);
            float totalDistance = shadowIntersection.distance;

            bool objFound = false;
            while (totalDistance >= eps && totalDistance <= lightDistance && shadowIntersection.distance != -1.0) {
                if(!shadowIntersection.material.isGlass && shadowIntersection.objectUID != 100 * (i+1)) {
                    objFound = true;
                    break;
                }

                totalDistance += shadowIntersection.distance + eps*5.0;
                shadowRay.origin = intersection.position + shadowIntersection.normal * eps * 10.0 + totalDistance * lightDir;
                shadowIntersection = intersect(shadowRay);
            }
            if (!objFound) {
                vec3 emission = sphere.material.emission * (sphere.radius * sphere.radius);
                color += emission * lightIntensity * max(0.0, dot(intersection.normal, lightDir));
            }
        }
    return color;
}

const float finalLumScale = 0.0008;
const int MAX_BOUNCES = 6;
bool hitGlass = false;
int decision = 0;
vec3 pathTrace(Ray ray) {
    int depth = 0;
    //color of ray, that flew out of the camera
    vec3 lightColor = vec3(0.0);
    vec3 resColor = vec3(0.0);
    vec3 throughput = vec3(1.0);
    int hitGlassI = 0;

    while(depth < MAX_BOUNCES) {
        Intersection intersection = intersect(ray);
        if(intersection.distance == -1.0) {
            break;
        }
        ray.origin = intersection.position;
        
        // // test normals
        // lightColor = intersection.normal * 500.0;
        // break;

        //update light color and throughput
        lightColor += intersection.material.emission;
        if(intersection.material.isGlass) {
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
            throughput *= intersection.material.albedo;
            if(cost2 > 0.0) {
                if(hitGlassI > 0)
                {
                    ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * intersection.normal);
                }
                else
                    if(hitGlassI == 0 && decision % 2 == 0 || hitGlassI == 1 && decision / 2 == 0) {
                        ray.dir = normalize(reflect(ray.dir, intersection.normal));
                        throughput *= R;
                        throughput *= intersection.material.albedoFactor; // reflection coef
                    }
                    else {
                        //refraction
                        ray.dir = normalize(n * ray.dir + (n * cost1 - sqrt(cost2)) * intersection.normal);
                        throughput *= (1.0 - R);
                    }
            }
            else {
                ray.dir = normalize(reflect(ray.dir, intersection.normal));
                throughput *= intersection.material.albedoFactor; // reflection coef
            }
            hitGlass = true;
            hitGlassI++;
        } 
        else {
            float diffuseFactor = 1.0 - intersection.material.reflectivity;
            float reflectFactor = intersection.material.reflectivity;
            //diffuse

            if(u_precompUsed == 1 && intersection.luminosity.x != -1.0 && intersection.objectUID == -1) {
                // for static precomputed objects
                float shadowScale = 1.0 - isInDynamicShadow(intersection) * 0.8;
                vec3 directLight = addDirectLight( intersection, true);
                resColor += (intersection.luminosity / finalLumScale + directLight) * diffuseFactor * intersection.material.albedo * intersection.material.albedoFactor * throughput / PI * shadowScale;
            }
            else {
                //for dynamic objects
                float shadowScale = 1.0 - isInDynamicShadow(intersection) * 0.8;
                vec3 directLight = addDirectLight( intersection, false);
                resColor += directLight * intersection.material.albedo * intersection.material.albedoFactor * throughput * diffuseFactor / PI * shadowScale;
            }
            if(reflectFactor == 0.0) {
                break;
            }
            
            //reflection
            float cost = dot(ray.dir, intersection.normal);
            ray.dir = normalize(ray.dir - intersection.normal * cost * 2.0);
            
            throughput *= intersection.material.albedo * intersection.material.albedoFactor * reflectFactor;
        }

        depth++;
    }
    return resColor + lightColor * throughput;
}
void main() {
    cur_seed = u_seed;
    Ray ray;
    float fovscale = 1.0;
    if(u_resolution.y > u_resolution.x) {
        fovscale *= u_resolution.y / u_resolution.x;
    }
    //get vector from angles
    
    vec3 top = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(u_cameraVec, top));
    top = normalize(cross(right, u_cameraVec));
    ray.dir = normalize(u_cameraVec + right * (pos.x * u_resolution.x / u_resolution.y) * fovscale + top * (pos.y) * fovscale);

    //ray.dir = vec3(0.0, 0.0, -1.0) + vec3(pos.x*(u_resolution.x / u_resolution.y), pos.y, 0.0) * fovscale;
    ray.dir = normalize(ray.dir);
    ray.origin = u_cameraPos;
    vec3 col = vec3(0.0);
    int samples_n = 1;
    for(int i = 0; i < samples_n; i++) {
        decision = 1;
        col += pathTrace(ray);
        if(hitGlass)
            samples_n= 1;
    }
    col /= float(samples_n);
    col *=  finalLumScale;
    //gamma correction
    col = pow(col, vec3(1.0 / 2.2));
    if(wrongTrigger)
        outColor = vec4(255.0, 0.0, 0.0, 1.0);
    else
        outColor = vec4(col, 1.0);
}