import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export type SampleModel = { id: string; title: string; parts: number; preview: string; file?: string };
export const SAMPLE_MIME = 'application/x-model-breakdown-sample';
// Add an approved GLB here using file: 'models/your-model.glb'. Paths are relative
// to public/ and also work when the site is hosted under a GitHub Pages subpath.
export const SAMPLE_MODELS: SampleModel[] = [
  { id: 'keypad', title: 'Keypad', parts: 9, preview: 'samples/keypad.svg' },
  { id: 'orbital', title: 'Orbital', parts: 8, preview: 'samples/orbital.svg' },
  { id: 'pavilion', title: 'Pavilion', parts: 12, preview: 'samples/pavilion.svg' },
];

export function createSampleModel(id: string): THREE.Group {
  const group = new THREE.Group();
  group.name = id.toUpperCase() + '_EXAMPLE';
  const material = new THREE.MeshStandardMaterial({color:0x989b96,metalness:0.25,roughness:0.5});
  const add = (name: string, geometry: THREE.BufferGeometry, pos: number[], rotation = [0,0,0]) => {
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.name=name; mesh.position.set(pos[0],pos[1],pos[2]);
    mesh.rotation.set(rotation[0],rotation[1],rotation[2]);group.add(mesh);
  };
  const box=(x:number,y:number,z:number,r=0.06)=>new RoundedBoxGeometry(x,y,z,4,r);
  if(id==='keypad'){
    for(let i=0;i<5;i++) add(`Key ${i+1}`,box(.58,.34,.78),[(i-2)*.71,1.62,0]);
    add('Key plate',box(4.22,.2,1.62),[0,.83,0]);
    add('Switch carrier',box(3.84,.16,1.32),[0,.13,0]);
    add('Control PCB',box(3.56,.12,1.16,.04),[0,-.54,0]);
    add('Lower shell',box(4.34,.54,1.78,.12),[0,-1.37,0]);
  } else if(id==='orbital'){
    add('Base plate',box(2.3,.25,1.5),[0,-1.5,0]);
    add('Pedestal',new THREE.CylinderGeometry(.3,.4,.5,48),[0,-1.13,0]);
    add('Outer ring',new THREE.TorusGeometry(1.35,.085,16,96),[0,.35,0]);
    add('Inner ring',new THREE.TorusGeometry(1,.075,16,96),[0,.35,0],[0,Math.PI/2.5,0]);
    add('Equatorial ring',new THREE.TorusGeometry(.7,.06,16,96),[0,.35,0],[Math.PI/2,0,0]);
    add('Central sphere',new THREE.SphereGeometry(.28,32,24),[0,.35,0]);
    add('Axis spindle',new THREE.CylinderGeometry(.055,.055,2.85,24),[0,.35,0]);
    add('Top cap',new THREE.SphereGeometry(.14,24,16),[0,1.83,0]);
  } else if(id==='pavilion'){
    add('Foundation',box(3.5,.2,2.5),[0,-1.3,0]);
    add('Floor plate',box(3.2,.12,2.2),[0,-1.03,0]);
    [[-1.35,-.05,-.85],[1.35,-.05,-.85],[-1.35,-.05,.85],[1.35,-.05,.85]].forEach((p,i)=>add(`Column ${i+1}`,box(.13,1.9,.13,.025),p));
    add('Left beam',box(.16,.18,2.2),[-1.35,.96,0]);
    add('Right beam',box(.16,.18,2.2),[1.35,.96,0]);
    add('Front beam',box(3.2,.18,.16),[0,.96,.95]);
    add('Rear beam',box(3.2,.18,.16),[0,.96,-.95]);
    add('Roof panel A',box(1.62,.12,2.5),[-.83,1.2,0],[0,0,-.08]);
    add('Roof panel B',box(1.62,.12,2.5),[.83,1.2,0],[0,0,.08]);
  } else { throw new Error(`Unknown example: ${id}`); }
  return group;
}

export async function sampleFile(sample: SampleModel): Promise<File> {
  if(sample.file){
    const response=await fetch(`${import.meta.env.BASE_URL}${sample.file}`);
    if(!response.ok) throw new Error(`Example unavailable (${response.status}). Import a local GLB instead.`);
    return new File([await response.arrayBuffer()], sample.file.split('/').pop()!, {type:'model/gltf-binary'});
  }
  const group=createSampleModel(sample.id);
  try {
    const buffer=await new GLTFExporter().parseAsync(group,{binary:true});
    if(!(buffer instanceof ArrayBuffer)) throw new Error('Could not prepare example GLB');
    return new File([buffer],`${sample.id}-example.glb`,{type:'model/gltf-binary'});
  } finally {
    group.traverse((item)=>{if(item instanceof THREE.Mesh){item.geometry.dispose(); const materials=Array.isArray(item.material)?item.material:[item.material];materials.forEach(m=>m.dispose());}});
  }
}
