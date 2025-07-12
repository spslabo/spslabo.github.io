---
title: "Setting Up a Talos VM in Proxmox"
date: 2025-07-12
tags: [talos, proxmox, kubernetes, homelab]
layout: single
---

Creating a Talos VM in Proxmox can come with some complications. Initially, I thought it would be fairly simple, but I ran into a few issues such as:

- `talosctl` being unable to reach nodes
- `kubectl` errors on port 6443
- DNS resolution failures
- DHCP misbehavior and IP conflicts

Below are the steps that finally worked for me.

## 🛠️ Pre-requisites

- Proxmox VE
- `talosctl` and `kubectl` installed (on Arch Linux: `pacman -S talosctl kubectl`)
- Latest Talos ISO from [GitHub Releases](https://github.com/siderolabs/talos/releases) — download directly to Proxmox if possible

## 💻 VM Configuration in Proxmox

> ⚠️ I'm not using QEMU Guest Agent. If you need it, follow the [official Talos Proxmox guide](https://www.talos.dev/v1.10/talos-guides/install/virtualized-platforms/proxmox/).

### VM Settings I used:

```
BIOS: Default (SeaBIOS)
boot: order=scsi0;ide2;net0
cores: 4
cpu: x86-64-v2-AES
ide2: local:iso/metal-amd64.iso,media=cdrom
memory: 4096
scsi0: VM_pool:vm-113-disk-0,iothread=1,size=32G
net0: virtio=xx:xx:xx:xx:xx:xx,bridge=vmbr0,firewall=1
scsihw: virtio-scsi-single
sockets: 1
```

Once your VM is created and started, press `e` at the GRUB menu to edit the boot options. We will be assigning a static IP to prevent any DHCP issues.

### 🧷 Add this to the end of `linux` line:

```
ip=192.168.1.190::192.168.1.1:255.255.255.0::ens18:off
```
The entire line should look like this:
```
linux /boot/vmlinuz init_on_alloc=1 slab_nomerge pti=on panic=0 consoleblank=0 printk.devkmsg=on earlyprintk=ttyS0 console=tty0 console=ttyS0 talos.platform=metal ip=192.168.1.190::192.168.1.1:255.255.255.0::ens18:off
```

> Make sure the network interface name (`ens18` here) matches your VM!  
> A roundabout way of checking is to boot the Talos ISO, press `F3`, and inspect the interface name in the "Network config" menu.

Press `Ctrl + X` or `F10` to boot. The VM will be in "Maintenance" mode.
{% include figure image_path="/assets/images/talos-node-maintenance-1.png" 
   alt="Talos node maintenance mode" 
   caption="Proxmox Console view of the Talos VM node in Maintenance mode" 
   width="80%" %}

## 🔧 Generating the Talos Config

```bash
talosctl gen config talos-proxmox-cluster https://192.168.1.190:6443 --output-dir _out
```

- `talos-proxmox-cluster`: name of your cluster
- Replace the IP with your control plane node's static IP
- _output-dir is optional

This generates:
- `controlplane.yaml`
- `worker.yaml`
- `talosconfig`

## ✏️ Editing `controlplane.yaml` or `worker.yaml`

Here’s what I added:

```yaml
network:
  interfaces:
    - interface: ens18
      addresses:
        - 192.168.1.190/24
      routes:
        - network: 0.0.0.0/0
          gateway: 192.168.1.1
          metric: 1024
      mtu: 1500
      dhcp: false
  nameservers:
    - 192.168.1.1
```

> Replace `ens18`, IPs, and nameserver as needed for your environment.

## 📦 Applying the Config

### Control Plane:

```bash
talosctl apply-config --insecure --nodes 192.168.1.190 --file _out/controlplane.yaml
```

### Worker Node:

```bash
talosctl apply-config --insecure --nodes 192.168.1.191 --file _out/worker.yaml
```

You should see logs flying by in the Proxmox console. The VM will reboot and set up Kubernetes.

## 🚀 Bootstrapping the Cluster

```bash
export TALOSCONFIG="_out/talosconfig"
talosctl config endpoint 192.168.1.190
talosctl config node 192.168.1.190
```
> If you are configuring multiple worker nodes, do not add all nodes as endpoints. See [Endpoints and Nodes](https://www.talos.dev/v1.10/learn-more/talosctl/#endpoints-and-nodes)

Then bootstrap:

```bash
talosctl -n 192.168.1.190 -e 192.168.1.190 --talosconfig _out/talosconfig bootstrap
```

> Only run the bootstrap command **once**, on a single control plane node!

## 📥 Retrieve Kubeconfig

```bash
talosctl kubeconfig -n 192.168.1.190 -e 192.168.1.190 --talosconfig _out/talosconfig
cp kubeconfig ~/.kube/config
```

You’re now ready to use `kubectl` and `talosctl`.

## Conclusion
I have found that running these steps allows me to setup a working Talos cluster in Proxmox without running into connection refused or timeout issues after a few hours/days.

## 🎁 Bonus: Assigning roles to nodes
You can specify the role of your node by running the following command:
```bash
kubectl label node talos-ctv-jbg node-role.kubernetes.io/worker=
```
In this example:
- `talos-ctv-jbg` is the name of your node
- `worker` is the role you're assigning

This adds the role `worker` to the node, which is commonly used for role-based scheduling, taints, or grouping in dashboards like the Kubernetes Dashboard or Lens.

`kubectl get nodes -o wide` should show all your current nodes in your cluster.

```bash
NAME            STATUS   ROLES           AGE     VERSION   INTERNAL-IP     EXTERNAL-IP   OS-IMAGE          KERNEL-VERSION   CONTAINER-RUNTIME
talos-ctv-jbg   Ready    worker          102m    v1.33.1   192.168.1.190   <none>        Talos (v1.10.4)   6.12.31-talos    containerd://2.0.5
talos-hme-bjg   Ready    control-plane   2d15h   v1.33.1   192.168.1.199   <none>        Talos (v1.10.4)   6.12.31-talos    containerd://2.0.5
```
## 💡 Tips

- 💿 **Unmount the Talos ISO** after install. Rebooting with the ISO mounted can corrupt config.
- 🐢 **Talos may show "connection refused"** errors during startup. Be patient — this is normal while it initializes.
- 🔄 If things break, you can often detach and remove the disk in Proxmox and attach a new one without recreating the whole VM.

---

## 🔗 Useful Links

- [Talos Troubleshooting Documentation](https://www.talos.dev/v1.10/introduction/troubleshooting/#kubelet-and-kubernetes-node-issues)
- [Talos Proxmox Install Guide](https://www.talos.dev/v1.10/talos-guides/install/virtualized-platforms/proxmox/)
- [Talos Getting Started Guide](https://www.talos.dev/v1.10/introduction/getting-started/)
