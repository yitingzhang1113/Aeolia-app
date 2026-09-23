import React from 'react';
import {Text,View,TouchableOpacity,StyleSheet,TextInput} from 'react-native';
import {colors as c} from './theme';

export function Avatar({outfit='teal',size=52}:{outfit?:string;size?:number}){
  const jacket:Record<string,string> = {teal:'#438D88',apricot:'#E6AC86',sage:'#94AA8B',navy:'#55758B'};
  // Lightweight dress-up avatar built from native views; can be replaced with 3D rendered assets.
  return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:'#DFEEEC',overflow:'hidden',alignItems:'center',justifyContent:'flex-end'}}>
    <View style={{position:'absolute',top:size*.12,width:size*.48,height:size*.44,borderRadius:size*.2,backgroundColor:'#443B39'}}/>
    <View style={{position:'absolute',top:size*.23,width:size*.34,height:size*.34,borderRadius:size*.18,backgroundColor:'#EBC6AC',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:size*.2,color:'#37383B',lineHeight:size*.23}}>•  •</Text></View>
    <View style={{width:size*.66,height:size*.34,borderTopLeftRadius:size*.25,borderTopRightRadius:size*.25,backgroundColor:jacket[outfit]||jacket.teal}}/>
  </View>;
}
export function Pill({label,onPress,active=false}:{label:string;onPress:()=>void;active?:boolean}){return <TouchableOpacity onPress={onPress} style={[styles.pill,active&&{backgroundColor:c.teal}]}><Text style={{color:active?c.white:c.ink,fontWeight:'600'}}>{label}</Text></TouchableOpacity>}
export function Button({label,onPress,secondary=false}:{label:string;onPress:()=>void;secondary?:boolean}){return <TouchableOpacity onPress={onPress} style={[styles.button,secondary&&{backgroundColor:c.white,borderWidth:1,borderColor:c.teal}]}><Text style={{color:secondary?c.teal:c.white,fontWeight:'700',fontSize:15}}>{label}</Text></TouchableOpacity>}
export function Section({title,action,children}:{title:string;action?:React.ReactNode;children:React.ReactNode}){return <View style={{marginBottom:22}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><Text style={styles.heading}>{title}</Text>{action}</View>{children}</View>}
export function Field(props:React.ComponentProps<typeof TextInput>){return <TextInput placeholderTextColor={c.muted} {...props} style={[styles.field,props.style]}/>}
export const styles = StyleSheet.create({page:{flex:1,backgroundColor:c.bg},body:{paddingHorizontal:20,paddingTop:16,paddingBottom:90},title:{fontSize:29,fontWeight:'800',color:c.ink},heading:{fontSize:19,fontWeight:'700',color:c.ink},text:{color:c.ink,fontSize:15},muted:{color:c.muted,fontSize:13,lineHeight:19},card:{backgroundColor:c.white,borderColor:c.line,borderWidth:1,borderRadius:17,padding:16},pill:{borderRadius:22,paddingHorizontal:16,paddingVertical:10,backgroundColor:c.mint,marginRight:8,marginBottom:8},button:{backgroundColor:c.teal,alignItems:'center',padding:15,borderRadius:13},field:{borderWidth:1,borderColor:c.line,borderRadius:12,padding:13,backgroundColor:c.white,color:c.ink,fontSize:15,marginBottom:12}});
